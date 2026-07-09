use crate::job_log::JobLog;
use crate::{PdfcpuBin, VideoServer};
use shared::{
    base_output_dir, Converter, ConvertDocument, CutVideo, DocFormat, Job, JobEnvelope, LogEntry,
    MergePdfs, Publisher,
};

/// Recent diagnostic job-log entries, newest first. Read-only view onto the
/// embedded SurrealDB log (→ wiki/decisions/adr-003-embedded-surrealdb.md) —
/// job history/status itself is not persisted, only this best-effort log.
#[tauri::command]
pub(crate) async fn get_job_logs(job_log: tauri::State<'_, JobLog>) -> Result<Vec<LogEntry>, String> {
    job_log.recent_logs().await.map_err(|e| e.to_string())
}

/// Registers `path` with the video server and returns a URL that streams it.
/// The URL carries an unguessable token, not the path, so the server never
/// exposes arbitrary files on disk.
#[tauri::command]
pub(crate) fn get_stream_url(server: tauri::State<'_, VideoServer>, path: String) -> String {
    let token = server.registry.register(path.into());
    format!("http://127.0.0.1:{}/?token={}", server.port, token)
}

#[tauri::command]
pub(crate) fn open_output_folder(subfolder: String) -> Result<(), String> {
    let path = if subfolder.is_empty() {
        base_output_dir()
    } else {
        shared::output_dir(&subfolder)
    };
    std::fs::create_dir_all(&path).ok();
    let opener = if cfg!(target_os = "macos") { "open" } else if cfg!(target_os = "windows") { "explorer" } else { "xdg-open" };
    std::process::Command::new(opener).arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn submit_doc_convert_job(
    publisher: tauri::State<'_, Publisher>,
    input: String,
    output_stem: String,
    to_format: String,
    converter: Option<String>,
) -> Result<String, String> {
    let to_format = match to_format.as_str() {
        "md" => DocFormat::Markdown,
        "docx" => DocFormat::Docx,
        "html" => DocFormat::Html,
        "pdf" => DocFormat::Pdf,
        other => return Err(format!("unknown format: {}", other)),
    };
    let converter = match converter.as_deref() {
        Some("word") => Some(Converter::Word),
        Some("libreoffice") | None => Some(Converter::LibreOffice),
        Some(other) => return Err(format!("unknown converter: {}", other)),
    };
    let job = JobEnvelope::new(Job::ConvertDocument(ConvertDocument { input, output_stem, to_format, converter }));
    publisher.publish(&job).await.map_err(|e| e.to_string())?;
    Ok(job.id)
}

#[tauri::command]
pub(crate) async fn submit_cut_job(
    publisher: tauri::State<'_, Publisher>,
    input: String,
    output: String,
    start_secs: f64,
    end_secs: f64,
) -> Result<String, String> {
    let job = JobEnvelope::new(Job::CutVideo(CutVideo {
        input,
        output,
        start_secs,
        end_secs,
    }));
    publisher.publish(&job).await.map_err(|e| e.to_string())?;
    Ok(job.id)
}

#[tauri::command]
pub(crate) async fn submit_merge_pdfs_job(
    publisher: tauri::State<'_, Publisher>,
    inputs: Vec<String>,
    output_stem: String,
) -> Result<String, String> {
    if inputs.len() < 2 {
        return Err("select at least 2 PDFs to merge".to_string());
    }
    let job = JobEnvelope::new(Job::MergePdfs(MergePdfs { inputs, output_stem }));
    publisher.publish(&job).await.map_err(|e| e.to_string())?;
    Ok(job.id)
}

/// Reads a PDF's page count via `pdfcpu info --json` for display in the
/// merge-order picker. pdfcpu has no page-rasterization capability, so this
/// is the closest thing to a thumbnail we can offer without a second tool.
#[tauri::command]
pub(crate) async fn get_pdf_page_count(
    pdfcpu: tauri::State<'_, PdfcpuBin>,
    path: String,
) -> Result<u32, String> {
    let bin = pdfcpu.0.clone();
    tokio::task::spawn_blocking(move || {
        let output = std::process::Command::new(&bin)
            .arg("info")
            .arg("--json")
            .arg(&path)
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
        }
        let json: serde_json::Value =
            serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())?;
        json["infos"][0]["pageCount"]
            .as_u64()
            .map(|n| n as u32)
            .ok_or_else(|| "pageCount missing from pdfcpu output".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
