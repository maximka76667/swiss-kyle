use crate::error::process_error;
use shared::{EditVideo, output_dir};
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
    job: EditVideo,
    ffmpeg_bin: &str,
    progress_tx: &UnboundedSender<f64>,
) -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "Editing {} → {} ({}-{}s)",
        job.input, job.output, job.start_secs, job.end_secs
    );

    let output_dir = output_dir("edit-video");
    std::fs::create_dir_all(&output_dir)?;
    let output_path = output_dir.join(&job.output);

    let duration_secs = (job.end_secs - job.start_secs).max(0.001);

    // -c copy can only start the output video on a keyframe, and some
    // sources (phone recordings in particular seem to vary wildly in GOP
    // size) space keyframes far enough apart that a short cut can contain
    // none at all — ffmpeg then silently writes zero video frames while
    // still copying audio fine, exiting 0 with an audio-only (or empty)
    // file. Re-encoding the video stream makes the cut frame-accurate
    // regardless of keyframe placement; audio has no such constraint and
    // stays a cheap stream copy. -ss before -i + -t (not -to) is the
    // standard fast-seek-then-decode-forward idiom: ffmpeg seeks to the
    // nearest preceding keyframe, decodes forward to the exact requested
    // start, then encodes exactly `duration_secs` from there.
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        job.start_secs.to_string(),
        "-i".to_string(),
        job.input.clone(),
        "-t".to_string(),
        duration_secs.to_string(),
        "-map".to_string(),
        "0:v:0?".to_string(),
        "-map".to_string(),
        "0:a:0?".to_string(),
        "-c:v".to_string(),
        "libx264".to_string(),
        "-preset".to_string(),
        "veryfast".to_string(),
        "-crf".to_string(),
        "18".to_string(),
        "-c:a".to_string(),
        "copy".to_string(),
    ];

    // libx264/yuv420p needs even dimensions; the frontend-computed drag
    // rectangle won't naturally land on even pixels.
    if let Some(crop) = &job.crop {
        let w = (crop.width & !1).max(2);
        let h = (crop.height & !1).max(2);
        args.push("-vf".to_string());
        args.push(format!("crop={}:{}:{}:{}", w, h, crop.x, crop.y));
    }

    args.push(output_path.to_string_lossy().into_owned());

    let mut child = Command::new(ffmpeg_bin)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;

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

    println!(
        "output written: {} exists = {}",
        output_path.display(),
        output_path.exists()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_time_from_ffmpeg_progress_line() {
        let line = "frame=  240 fps= 60 q=-1.0 size=    1024KiB time=00:01:30.50 bitrate= 928.4kbits/s speed=25.1x";
        assert_eq!(parse_time_secs(line), Some(90.5));
    }

    #[test]
    fn parses_time_at_end_of_line() {
        assert_eq!(parse_time_secs("time=01:00:00.00"), Some(3600.0));
    }

    #[test]
    fn line_without_time_is_none() {
        assert_eq!(parse_time_secs("frame=  240 fps= 60 q=-1.0"), None);
    }

    #[test]
    fn unparseable_time_is_none() {
        // ffmpeg emits time=N/A before the first timestamp is known
        assert_eq!(parse_time_secs("size=N/A time=N/A bitrate=N/A"), None);
        assert_eq!(parse_time_secs("time=90.5 bitrate=..."), None);
    }

    #[test]
    fn zero_time_is_zero_secs() {
        assert_eq!(parse_time_secs("time=00:00:00.00 bitrate=..."), Some(0.0));
    }
}
