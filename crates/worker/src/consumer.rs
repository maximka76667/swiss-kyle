use async_nats::jetstream::consumer::{Consumer, pull};
use async_nats::jetstream::stream::Stream;
use std::time::Duration;

/// How long JetStream waits for an ack before redelivering a job to another
/// worker. Kept short so a crashed worker's job is picked up quickly; jobs
/// that legitimately run longer keep the message alive via progress acks.
pub const ACK_WAIT: Duration = Duration::from_secs(30);
/// Sent while a job runs to reset the ack_wait timer. Must stay below
/// ACK_WAIT, or the message expires between heartbeats and gets redelivered.
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(10);
/// Poison-pill guard: a job that repeatedly kills workers is dropped after
/// this many delivery attempts.
const MAX_DELIVER: i64 = 3;

/// Creates the durable `workers` pull consumer, replacing one whose persisted
/// config no longer matches. All workers race through this at startup, so
/// creation retries instead of exiting.
pub async fn ensure_consumer(
    stream: &Stream,
    worker_id: usize,
) -> Result<Consumer<pull::Config>, async_nats::Error> {
    let desired = pull::Config {
        durable_name: Some("workers".to_string()),
        ack_wait: ACK_WAIT,
        max_deliver: MAX_DELIVER,
        ..Default::default()
    };

    // JetStream persists durable-consumer config; drop a stale one so it is
    // recreated with the settings above.
    if let Ok(info) = stream.consumer_info("workers").await {
        if info.config.ack_wait != ACK_WAIT || info.config.max_deliver != MAX_DELIVER {
            println!(
                "Worker {worker_id} recreating consumer 'workers' (stale ack_wait {:?} / max_deliver {})",
                info.config.ack_wait, info.config.max_deliver
            );
            if let Err(e) = stream.delete_consumer("workers").await {
                // Another worker likely deleted it first.
                eprintln!("Worker {worker_id} delete_consumer failed: {e:?}");
            }
        }
    }

    let mut attempts = 0;
    loop {
        match stream
            .get_or_create_consumer("workers", desired.clone())
            .await
        {
            Ok(c) => return Ok(c),
            Err(e) if attempts < 10 => {
                attempts += 1;
                eprintln!("Worker {worker_id} consumer create failed (attempt {attempts}): {e:?}");
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            Err(e) => return Err(e.into()),
        }
    }
}
