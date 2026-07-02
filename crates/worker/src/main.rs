mod consumer;
mod convert_document;
mod cut_video;
mod error;
mod job;
mod merge_pdfs;

use consumer::ensure_consumer;
use futures::StreamExt;
use job::{Bins, handle_message};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), async_nats::Error> {
    let worker_id: usize = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(0);
    let bins = Bins::from_env();
    println!(
        "Worker {worker_id} using ffmpeg={} pandoc={} typst={} pdfcpu={}",
        bins.ffmpeg, bins.pandoc, bins.typst, bins.pdfcpu
    );

    let client = async_nats::connect("nats://localhost:4222").await?;
    let jetstream = async_nats::jetstream::new(client.clone());
    let stream = jetstream
        .get_or_create_stream(async_nats::jetstream::stream::Config {
            name: "JOBS".to_string(),
            subjects: vec!["jobs".to_string()],
            ..Default::default()
        })
        .await?;
    let consumer = ensure_consumer(&stream, worker_id).await?;
    println!("Worker {worker_id} ready, entering fetch loop");

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
                eprintln!("Worker {worker_id} fetch() error: {e:?}");
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };
        futures::pin_mut!(messages);

        match messages.next().await {
            Some(Ok(message)) => handle_message(&client, message, bins, worker_id).await,
            Some(Err(e)) => eprintln!("Worker {worker_id} message stream error: {e:?}"),
            None => {}
        }
    }
}
