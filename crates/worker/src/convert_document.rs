use crate::error::process_error;
use shared::{output_dir, Converter, ConvertDocument, DocFormat};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn run(
    job: ConvertDocument,
    job_id: &str,
    pandoc_bin: &str,
    typst_bin: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let ext = job.to_format.extension();
    let output_filename = format!("{}.{}", job.output_stem, ext);

    println!("Converting {} → {} (format: {:?})", job.input, output_filename, job.to_format);

    let output_root = output_dir("convert-document");
    fs::create_dir_all(&output_root)?;

    let work_dir = output_root.join(job_id);
    fs::create_dir_all(&work_dir)?;

    let work_output = work_dir.join(&output_filename);
    let final_output = output_root.join(&output_filename);

    let result = convert(&job, &work_output, &work_dir, pandoc_bin, typst_bin);

    match &result {
        Ok(()) => {
            if let Err(e) = fs::rename(&work_output, &final_output) {
                let _ = fs::remove_dir_all(&work_dir);
                return Err(format!("failed to move output: {}", e).into());
            }
        }
        Err(_) => {}
    }

    let _ = fs::remove_dir_all(&work_dir);
    result
}

fn convert(
    job: &ConvertDocument,
    output_path: &PathBuf,
    work_dir: &PathBuf,
    pandoc_bin: &str,
    typst_bin: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let input_ext = Path::new(&job.input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_office = matches!(input_ext.as_str(), "doc" | "docx" | "odt" | "rtf");

    match (&job.to_format, is_office) {
        (DocFormat::Pdf, true) => {
            let converter = job.converter.clone().unwrap_or(Converter::LibreOffice);
            match converter {
                Converter::Word => convert_word(&job.input, output_path),
                Converter::LibreOffice => convert_libreoffice(&job.input, output_path),
            }
        }
        (DocFormat::Pdf, false) => convert_pandoc_typst(&job.input, output_path, work_dir, pandoc_bin, typst_bin),
        _ => convert_pandoc(&job.input, output_path, &job.to_format, pandoc_bin),
    }
}

fn convert_pandoc(
    input: &str,
    output_path: &PathBuf,
    to_format: &DocFormat,
    pandoc_bin: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let format_arg = match to_format {
        DocFormat::Markdown => "markdown",
        DocFormat::Docx => "docx",
        DocFormat::Html => "html",
        DocFormat::Pdf => unreachable!(),
    };

    let r = Command::new(pandoc_bin)
        .arg(input)
        .arg("--to")
        .arg(format_arg)
        .arg("--output")
        .arg(output_path)
        .output()?;

    if !r.status.success() {
        return Err(process_error("pandoc", r.status, &String::from_utf8_lossy(&r.stderr)));
    }

    println!("output written: {}", output_path.display());
    Ok(())
}

fn convert_pandoc_typst(
    input: &str,
    pdf_path: &PathBuf,
    work_dir: &PathBuf,
    pandoc_bin: &str,
    typst_bin: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let stem = pdf_path.file_stem().unwrap_or_default().to_string_lossy();
    let typ_path = work_dir.join(format!("{}.typ", stem));

    let r = Command::new(pandoc_bin)
        .current_dir(work_dir)
        .arg(input)
        .arg("--to=typst")
        .arg("--output")
        .arg(&typ_path)
        .arg("--extract-media=.")
        .output()?;
    if !r.status.success() {
        return Err(process_error("pandoc", r.status, &String::from_utf8_lossy(&r.stderr)));
    }

    let src = fs::read_to_string(&typ_path)?;
    fs::write(&typ_path, strip_toc_links(&src))?;

    let r = Command::new(typst_bin)
        .current_dir(work_dir)
        .arg("compile")
        .arg(&typ_path)
        .arg(pdf_path)
        .output()?;
    if !r.status.success() {
        return Err(process_error("typst", r.status, &String::from_utf8_lossy(&r.stderr)));
    }

    println!("output written: {}", pdf_path.display());
    Ok(())
}

fn convert_word(input: &str, pdf_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    return convert_word_com(input, pdf_path);

    #[cfg(not(target_os = "windows"))]
    Err("Microsoft Word is only available on Windows".into())
}

#[cfg(target_os = "windows")]
fn convert_word_com(input: &str, pdf_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let input_ps = input.replace('\'', "''");
    let output_ps = pdf_path.to_string_lossy().replace('\'', "''");

    let script = format!(
        "$ErrorActionPreference = 'Stop'\n\
         $word = New-Object -ComObject Word.Application\n\
         $word.Visible = $false\n\
         try {{\n\
             $doc = $word.Documents.Open('{input}')\n\
             $doc.ExportAsFixedFormat('{output}', 17)\n\
             $doc.Close($false)\n\
         }} finally {{\n\
             $word.Quit()\n\
         }}",
        input = input_ps,
        output = output_ps,
    );

    let r = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(&script)
        .output()?;

    if !r.status.success() {
        return Err(format!("Word COM failed: {}", String::from_utf8_lossy(&r.stderr)).into());
    }

    println!("output written: {}", pdf_path.display());
    Ok(())
}

fn find_libreoffice() -> Result<String, Box<dyn std::error::Error>> {
    #[cfg(target_os = "windows")]
    let candidates = [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ];
    #[cfg(target_os = "linux")]
    let candidates = [
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
        "/usr/local/bin/soffice",
    ];
    #[cfg(target_os = "macos")]
    let candidates = ["/Applications/LibreOffice.app/Contents/MacOS/soffice"];

    for path in candidates {
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    let name = if cfg!(target_os = "windows") { "soffice.exe" } else { "soffice" };
    if Command::new(name).arg("--version").output().is_ok() {
        return Ok(name.to_string());
    }

    Err("LibreOffice is not installed. Download it from https://www.libreoffice.org/download/download-libreoffice/".into())
}

fn convert_libreoffice(input: &str, pdf_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
    let soffice = find_libreoffice()?;
    let work_dir = pdf_path.parent().unwrap();

    let r = Command::new(&soffice)
        .arg("--headless")
        .arg("--norestore")
        .arg("--nofirststartwizard")
        .arg("--convert-to")
        .arg("pdf")
        .arg("--outdir")
        .arg(work_dir)
        .arg(input)
        .output()?;

    if !r.status.success() {
        return Err(format!("LibreOffice failed: {}", String::from_utf8_lossy(&r.stderr)).into());
    }

    let input_stem = Path::new(input).file_stem().unwrap_or_default().to_string_lossy();
    let lo_pdf = work_dir.join(format!("{}.pdf", input_stem));
    if lo_pdf != *pdf_path && lo_pdf.exists() {
        fs::rename(&lo_pdf, pdf_path)?;
    }

    println!("output written: {}", pdf_path.display());
    Ok(())
}

fn strip_toc_links(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut rest = src;
    while let Some(start) = rest.find("#link(<_Toc") {
        out.push_str(&rest[..start]);
        rest = &rest[start..];
        if let Some(end) = rest.find(">)") {
            rest = &rest[end + 2..];
        } else {
            break;
        }
    }
    out.push_str(rest);
    out
}
