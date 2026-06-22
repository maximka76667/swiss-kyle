use futures::StreamExt;
use shared::{CutVideo, Job};
use std::process::Command;
use std::time::Duration;

fn cut_video(job: CutVideo) -> Result<(), Box<dyn std::error::Error>> {
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

    let output = Command::new("ffmpeg").args(&args).output()?;

    println!(
        "ffmpeg stdout:\n{}",
        String::from_utf8_lossy(&output.stdout)
    );
    println!(
        "ffmpeg stderr:\n{}",
        String::from_utf8_lossy(&output.stderr)
    );

    if !output.status.success() {
        return Err(format!("ffmpeg exited with {}", output.status).into());
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
    let jetstream = async_nats::jetstream::new(client);

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

            let job: Job = match serde_json::from_slice(&message.payload) {
                Ok(j) => j,
                Err(e) => {
                    eprintln!("Worker {} failed to deserialize job: {:?}", worker_id, e);
                    let _ = message.ack().await;
                    continue;
                }
            };

            match job {
                Job::CutVideo(j) => {
                    println!("Worker {} processing job", worker_id);
                    match cut_video(j) {
                        Ok(()) => println!("Worker {} done", worker_id),
                        Err(e) => eprintln!("Worker {} failed: {}", worker_id, e),
                    }
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
