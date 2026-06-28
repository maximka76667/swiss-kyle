mod convert_to_pdf;
mod cut_video;
mod error;

use futures::StreamExt;
use shared::{Job, JobEnvelope, JobStatus, StatusEvent, publish_status};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), async_nats::Error> {
    let args: Vec<String> = std::env::args().collect();
    let worker_id: usize = args.get(1).and_then(|a| a.parse().ok()).unwrap_or(0);

    let ffmpeg_bin = std::env::var("FFMPEG_BIN").unwrap_or_else(|_| "ffmpeg".to_string());
    let pandoc_bin = std::env::var("PANDOC_BIN").unwrap_or_else(|_| "pandoc".to_string());
    let typst_bin = std::env::var("TYPST_BIN").unwrap_or_else(|_| "typst".to_string());
    println!(
        "Worker {} using ffmpeg={} pandoc={} typst={}",
        worker_id, ffmpeg_bin, pandoc_bin, typst_bin
    );

    println!(
        "Worker {} connecting to nats://localhost:4222 ...",
        worker_id
    );
    let client = async_nats::connect("nats://localhost:4222").await?;
    println!(
        "Worker {} connected, connection state: {:?}",
        worker_id,
        client.connection_state()
    );
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

            let job_id = envelope.id.clone();
            let _ = publish_status(
                &client,
                &StatusEvent {
                    id: job_id.clone(),
                    status: JobStatus::Received,
                },
            )
            .await;
            println!("Worker {} processing job {}", worker_id, job_id);

            let final_status = match envelope.job {
                Job::CutVideo(j) => {
                    let (progress_tx, mut progress_rx) =
                        tokio::sync::mpsc::unbounded_channel::<f64>();
                    let progress_client = client.clone();
                    let progress_id = job_id.clone();
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

                    let result = cut_video::run(j, &ffmpeg_bin, &progress_tx);
                    drop(progress_tx);
                    let _ = progress_task.await;
                    result
                }
                Job::ConvertToPdf(j) => convert_to_pdf::run(j, &pandoc_bin, &typst_bin),
            };

            let status = match final_status {
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
            let _ = publish_status(&client, &StatusEvent { id: job_id, status }).await;

            message.ack().await?;
        } else {
            empty_fetches += 1;
            if empty_fetches % 5 == 1 {
                println!(
                    "Worker {} fetch timed out with no messages (count {})",
                    worker_id, empty_fetches
                );
            }
        }
    }
}
