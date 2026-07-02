use crate::consumer::HEARTBEAT_INTERVAL;
use crate::{convert_document, cut_video, merge_pdfs};
use async_nats::jetstream::{AckKind, Message};
use shared::{Job, JobEnvelope, JobStatus, StatusEvent, publish_status};

pub struct Bins {
    pub ffmpeg: String,
    pub pandoc: String,
    pub typst: String,
    pub pdfcpu: String,
}

impl Bins {
    /// Leaked once at startup: process-lifetime config, so the blocking job
    /// closures can capture a `&'static` reference instead of cloning.
    pub fn from_env() -> &'static Self {
        let get = |var, default: &str| std::env::var(var).unwrap_or_else(|_| default.to_string());
        Box::leak(Box::new(Self {
            ffmpeg: get("FFMPEG_BIN", "ffmpeg"),
            pandoc: get("PANDOC_BIN", "pandoc"),
            typst: get("TYPST_BIN", "typst"),
            pdfcpu: get("PDFCPU_BIN", "pdfcpu"),
        }))
    }
}

async fn emit(client: &async_nats::Client, id: &str, status: JobStatus) {
    let event = StatusEvent {
        id: id.to_string(),
        status,
    };
    let _ = publish_status(client, &event).await;
}

/// Deserializes and runs one job, publishing status events along the way.
/// Always acks: a malformed or failed job must not be redelivered forever.
pub async fn handle_message(
    client: &async_nats::Client,
    message: Message,
    bins: &'static Bins,
    worker_id: usize,
) {
    let envelope: JobEnvelope = match serde_json::from_slice(&message.payload) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("Worker {worker_id} failed to deserialize job: {e:?}");
            let id = serde_json::from_slice::<serde_json::Value>(&message.payload)
                .ok()
                .and_then(|v| v.get("id")?.as_str().map(String::from))
                .unwrap_or_else(|| "unknown".to_string());
            emit(
                client,
                &id,
                JobStatus::Failed {
                    reason: format!("failed to deserialize job: {e}"),
                },
            )
            .await;
            let _ = message.ack().await;
            return;
        }
    };

    let job_id = envelope.id.clone();
    println!("Worker {worker_id} processing job {job_id}");
    emit(client, &job_id, JobStatus::Received).await;

    let status = match run_job(client, &message, envelope, bins, worker_id).await {
        Ok(()) => {
            println!("Worker {worker_id} done");
            JobStatus::Done
        }
        Err(e) => {
            eprintln!("Worker {worker_id} failed: {e}");
            JobStatus::Failed { reason: e }
        }
    };
    emit(client, &job_id, status).await;

    if let Err(e) = message.ack().await {
        // The job already ran; on a lost ack JetStream redelivers and
        // max_deliver bounds the damage. Not worth killing the worker.
        eprintln!("Worker {worker_id} ack failed: {e:?}");
    }
}

/// Runs the blocking job off the async runtime while sending progress acks:
/// each ack resets the ack_wait timer, so slow jobs are not redelivered, while
/// a crashed worker's job frees up after ACK_WAIT.
async fn run_job(
    client: &async_nats::Client,
    message: &Message,
    envelope: JobEnvelope,
    bins: &'static Bins,
    worker_id: usize,
) -> Result<(), String> {
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel::<f64>();
    let progress_client = client.clone();
    let progress_id = envelope.id.clone();
    let progress_task = tokio::spawn(async move {
        while let Some(percent) = progress_rx.recv().await {
            emit(
                &progress_client,
                &progress_id,
                JobStatus::Processing { percent },
            )
            .await;
        }
    });

    // Jobs block on child processes, so run them off the runtime.
    // Box<dyn Error> is not Send; carry errors across the thread as String.
    let job_id = envelope.id;
    let mut job_task = tokio::task::spawn_blocking(move || {
        match envelope.job {
            Job::CutVideo(j) => cut_video::run(j, &bins.ffmpeg, &progress_tx),
            Job::ConvertDocument(j) => convert_document::run(j, &job_id, &bins.pandoc, &bins.typst),
            Job::MergePdfs(j) => merge_pdfs::run(j, &bins.pdfcpu),
        }
        .map_err(|e| e.to_string())
    });

    let mut heartbeat = tokio::time::interval(HEARTBEAT_INTERVAL);
    heartbeat.tick().await; // consume the immediate first tick
    let joined = loop {
        tokio::select! {
            res = &mut job_task => break res,
            _ = heartbeat.tick() => {
                if let Err(e) = message.ack_with(AckKind::Progress).await {
                    eprintln!("Worker {worker_id} progress ack failed: {e:?}");
                }
            }
        }
    };
    let _ = progress_task.await;

    joined.unwrap_or_else(|e| Err(format!("job task panicked: {e}")))
}
