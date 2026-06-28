use crate::error::process_error;
use shared::{output_dir, ConvertToPdf};
use std::process::Command;

pub fn run(job: ConvertToPdf, pandoc_bin: &str, typst_bin: &str) -> Result<(), Box<dyn std::error::Error>> {
    println!("Converting {} → {}", job.input, job.output);

    let output_dir = output_dir("convert-to-pdf");
    std::fs::create_dir_all(&output_dir)?;
    let output_path = output_dir.join(&job.output);

    let result = Command::new(pandoc_bin)
        .arg(&job.input)
        .arg("--output")
        .arg(&output_path)
        .arg(format!("--pdf-engine={}", typst_bin))
        .output()?;

    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(process_error("pandoc", result.status, &stderr));
    }

    println!("output written: {} exists = {}", output_path.display(), output_path.exists());
    Ok(())
}
