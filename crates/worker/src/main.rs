mod consumer;
mod convert_document;
mod cut_video;
mod error;
mod job;
mod merge_pdfs;

use consumer::ensure_consumer;
use futures::StreamExt;
use job::{Bins, handle_message};
use shared::{WorkerHeartbeat, WorkerState, publish_heartbeat};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// How often a worker announces its idle/busy status (UI liveness signal,
/// unrelated to JetStream's ack-progress heartbeat in consumer.rs).
const WORKER_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

/// Publishes the worker's current state on a fixed interval, independent of
/// any in-flight job, so the UI can tell idle/busy/offline apart.
async fn heartbeat_loop(client: async_nats::Client, worker_id: usize, state: Arc<Mutex<WorkerState>>) {
    let mut interval = tokio::time::interval(WORKER_HEARTBEAT_INTERVAL);
    loop {
        interval.tick().await;
        let current = state.lock().unwrap().clone();
        let heartbeat = WorkerHeartbeat {
            worker_id,
            state: current,
            timestamp: time::OffsetDateTime::now_utc(),
        };
        let _ = publish_heartbeat(&client, &heartbeat).await;
    }
}

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

    let worker_state = Arc::new(Mutex::new(WorkerState::Idle));
    tokio::spawn(heartbeat_loop(client.clone(), worker_id, worker_state.clone()));

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
                *worker_state.lock().unwrap() = WorkerState::Error {
                    reason: e.to_string(),
                };
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
        };
        // fetch() succeeded: the consumer loop itself is healthy again,
        // clearing any previously-reported Error state.
        *worker_state.lock().unwrap() = WorkerState::Idle;
        futures::pin_mut!(messages);

        match messages.next().await {
            Some(Ok(message)) => {
                let job_id = extract_job_id(&message.payload);
                *worker_state.lock().unwrap() = WorkerState::Busy { job_id };
                handle_message(&client, message, bins, worker_id).await;
                *worker_state.lock().unwrap() = WorkerState::Idle;
            }
            Some(Err(e)) => eprintln!("Worker {worker_id} message stream error: {e:?}"),
            None => {}
        }
    }
}

fn extract_job_id(payload: &[u8]) -> String {
    serde_json::from_slice::<serde_json::Value>(payload)
        .ok()
        .and_then(|v| v.get("id")?.as_str().map(String::from))
        .unwrap_or_else(|| "unknown".to_string())
}
