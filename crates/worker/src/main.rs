use futures::StreamExt;
use shared::{publish_status, CutVideo, Job, JobEnvelope, JobStatus, StatusEvent};
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

/// Parses ffmpeg's `time=HH:MM:SS.cc` field out of a progress line, returning seconds.
fn parse_time_secs(line: &str) -> Option<f64> {
    let rest = &line[line.find("time=")? + "time=".len()..];
    let time_str = &rest[..rest.find(' ').unwrap_or(rest.len())];
    let mut parts = time_str.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}

fn cut_video(
    job: CutVideo,
    progress_tx: &UnboundedSender<f64>,
) -> Result<(), Box<dyn std::error::Error>> {
    println!(
        "Cutting {} → {} ({}-{}s)",
        job.input, job.output, job.start_secs, job.end_secs
    );

    let output_dir = dirs::video_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("no home dir").join("Videos"))
        .join("swiss-kyle");
    std::fs::create_dir_all(&output_dir)?;
    let output_path = output_dir.join(&job.output);
    println!("resolved output path: {}", output_path.display());

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
    println!("ffmpeg args: {:?}", args);

    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;

    let duration_secs = (job.end_secs - job.start_secs).max(0.001);
    // ffmpeg redraws its progress line with '\r' rather than '\n', so split on
    // either byte instead of reading by line (which would block until EOF).
    let mut stderr = child.stderr.take().expect("stderr was piped");
    let mut line = String::new();
    let mut byte = [0u8; 1];
    while stderr.read(&mut byte)? > 0 {
        match byte[0] {
            b'\r' | b'\n' => {
                if let Some(secs) = parse_time_secs(&line) {
                    let percent = ((secs / duration_secs) * 100.0).clamp(0.0, 100.0);
                    let _ = progress_tx.send(percent);
                }
                line.clear();
            }
            c => line.push(c as char),
        }
    }

    let status = child.wait()?;
    if !status.success() {
        return Err(format!("ffmpeg exited with {}", status).into());
    }

    println!(
        "output written: {} exists = {}",
        output_path.display(),
        output_path.exists()
    );

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), async_nats::Error> {
    let args: Vec<String> = std::env::args().collect();
    let worker_id: usize = args.get(1).and_then(|a| a.parse().ok()).unwrap_or(0);

    println!("Worker {} connecting to nats://localhost:4222 ...", worker_id);
    let client = async_nats::connect("nats://localhost:4222").await?;
    println!("Worker {} connected, connection state: {:?}", worker_id, client.connection_state());
    let jetstream = async_nats::jetstream::new(client.clone());

    let stream = jetstream
        .get_or_create_stream(async_nats::jetstream::stream::Config {
            name: "JOBS".to_string(),
            subjects: vec!["jobs".to_string()],
            ..Default::default()
        })
        .await?;
    println!("Worker {} stream JOBS ready", worker_id);

    let consumer = stream
        .get_or_create_consumer(
            "workers",
            async_nats::jetstream::consumer::pull::Config {
                durable_name: Some("workers".to_string()),
                ..Default::default()
            },
        )
        .await?;
    println!("Worker {} consumer 'workers' ready", worker_id);

    println!("Worker {} ready, entering fetch loop", worker_id);

    let mut empty_fetches = 0u64;
    loop {
        let messages = match consumer
            .fetch()
            .max_messages(1)
            .expires(Duration::from_secs(5))
            .messages()
            .await
        {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Worker {} fetch() error: {:?}", worker_id, e);
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };
        futures::pin_mut!(messages);

        if let Some(message) = messages.next().await {
            empty_fetches = 0;
            let message = match message {
                Ok(m) => m,
                Err(e) => {
                    eprintln!("Worker {} message stream error: {:?}", worker_id, e);
                    continue;
                }
            };
            println!(
                "Worker {} got message on subject '{}', {} bytes: {}",
                worker_id,
                message.subject,
                message.payload.len(),
                String::from_utf8_lossy(&message.payload)
            );

            let envelope: JobEnvelope = match serde_json::from_slice(&message.payload) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("Worker {} failed to deserialize job: {:?}", worker_id, e);
                    let _ = message.ack().await;
                    continue;
                }
            };

            match envelope.job {
                Job::CutVideo(j) => {
                    println!("Worker {} processing job {}", worker_id, envelope.id);
                    let _ = publish_status(
                        &client,
                        &StatusEvent {
                            id: envelope.id.clone(),
                            status: JobStatus::Received,
                        },
                    )
                    .await;

                    let (progress_tx, mut progress_rx) =
                        tokio::sync::mpsc::unbounded_channel::<f64>();
                    let progress_client = client.clone();
                    let progress_id = envelope.id.clone();
                    let progress_task = tokio::spawn(async move {
                        while let Some(percent) = progress_rx.recv().await {
                            let _ = publish_status(
                                &progress_client,
                                &StatusEvent {
                                    id: progress_id.clone(),
                                    status: JobStatus::Processing { percent },
                                },
                            )
                            .await;
                        }
                    });

                    let status = match cut_video(j, &progress_tx) {
                        Ok(()) => {
                            println!("Worker {} done", worker_id);
                            JobStatus::Done
                        }
                        Err(e) => {
                            eprintln!("Worker {} failed: {}", worker_id, e);
                            JobStatus::Failed {
                                reason: e.to_string(),
                            }
                        }
                    };
                    drop(progress_tx);
                    let _ = progress_task.await;

                    let _ = publish_status(
                        &client,
                        &StatusEvent {
                            id: envelope.id,
                            status,
                        },
                    )
                    .await;
                }
            }

            message.ack().await?;
        } else {
            empty_fetches += 1;
            if empty_fetches % 5 == 1 {
                println!("Worker {} fetch timed out with no messages (count {})", worker_id, empty_fetches);
            }
        }
    }
}
