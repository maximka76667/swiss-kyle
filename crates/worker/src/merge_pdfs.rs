use crate::error::process_error;
use shared::{MergePdfs, output_dir};
use std::process::Command;

pub fn run(job: MergePdfs, pdfcpu_bin: &str) -> Result<(), Box<dyn std::error::Error>> {
    if job.inputs.len() < 2 {
        return Err("merge requires at least 2 input files".into());
    }

    println!(
        "Merging {} files → {}.pdf",
        job.inputs.len(),
        job.output_stem
    );

    let output_dir = output_dir("merge-pdfs");
    std::fs::create_dir_all(&output_dir)?;
    let output_path = output_dir.join(format!("{}.pdf", job.output_stem));

    let r = Command::new(pdfcpu_bin)
        .arg("merge")
        .arg(&output_path)
        .args(&job.inputs)
        .output()?;

    if !r.status.success() {
        return Err(process_error(
            "pdfcpu",
            r.status,
            &String::from_utf8_lossy(&r.stderr),
        ));
    }

    println!("output written: {}", output_path.display());
    Ok(())
}
