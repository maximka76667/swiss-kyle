use crate::error::process_error;
use shared::{output_dir, CutVideo};
use std::io::Read;
use std::process::{Command, Stdio};
use tokio::sync::mpsc::UnboundedSender;

fn parse_time_secs(line: &str) -> Option<f64> {
    let rest = &line[line.find("time=")? + "time=".len()..];
    let time_str = &rest[..rest.find(' ').unwrap_or(rest.len())];
    let mut parts = time_str.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

pub fn run(
    job: CutVideo,
    ffmpeg_bin: &str,
    progress_tx: &UnboundedSender<f64>,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Cutting {} → {} ({}-{}s)", job.input, job.output, job.start_secs, job.end_secs);

    let output_dir = output_dir("cut-video");
    std::fs::create_dir_all(&output_dir)?;
    let output_path = output_dir.join(&job.output);

    let args = [
        "-y".to_string(),
        "-i".to_string(),
        job.input.clone(),
        "-ss".to_string(),
        job.start_secs.to_string(),
        "-to".to_string(),
        job.end_secs.to_string(),
        "-c".to_string(),
        "copy".to_string(),
        output_path.to_string_lossy().into_owned(),
    ];

    let mut child = Command::new(ffmpeg_bin)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;

    let duration_secs = (job.end_secs - job.start_secs).max(0.001);
    let mut stderr = child.stderr.take().expect("stderr was piped");
    let mut line = String::new();
    let mut stderr_buf = String::new();
    let mut byte = [0u8; 1];

    while stderr.read(&mut byte)? > 0 {
        match byte[0] {
            b'\r' | b'\n' => {
                if let Some(secs) = parse_time_secs(&line) {
                    let percent = ((secs / duration_secs) * 100.0).clamp(0.0, 100.0);
                    let _ = progress_tx.send(percent);
                }
                if !line.trim().is_empty() {
                    stderr_buf.push_str(&line);
                    stderr_buf.push('\n');
                }
                line.clear();
            }
            c => line.push(c as char),
        }
    }
    if !line.trim().is_empty() {
        stderr_buf.push_str(&line);
    }

    let status = child.wait()?;
    if !status.success() {
        return Err(process_error("ffmpeg", status, &stderr_buf));
    }

    println!("output written: {} exists = {}", output_path.display(), output_path.exists());
    Ok(())
}
