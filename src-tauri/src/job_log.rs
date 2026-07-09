use futures::StreamExt;
use shared::{LogEntry, LogLevel, WorkerHeartbeat, LOG_SUBJECT, WORKERS_HEARTBEAT_SUBJECT};
use surrealdb::engine::local::{Db, SurrealKv};
use surrealdb::types::SurrealValue;
use surrealdb::Surreal;
use tauri::{AppHandle, Emitter};

/// Storage shape for SurrealDB, distinct from `shared::LogEntry` (the NATS
/// wire type): SurrealDB 3.x requires `SurrealValue` for typed content/query
/// results, which `shared` doesn't derive (it would pull the whole surrealdb
/// crate into the worker binary just for this). Uses plain strings for
/// level/timestamp rather than deriving SurrealValue on the shared enums.
#[derive(Debug, Clone, SurrealValue)]
struct LogRecord {
    job_id: String,
    job_type: String,
    level: String,
    message: String,
    timestamp: String,
}

impl From<&LogEntry> for LogRecord {
    fn from(entry: &LogEntry) -> Self {
        let level = match entry.level {
            LogLevel::Info => "Info",
            LogLevel::Warn => "Warn",
            LogLevel::Error => "Error",
        };
        Self {
            job_id: entry.job_id.clone(),
            job_type: entry.job_type.clone(),
            level: level.to_string(),
            message: entry.message.clone(),
            timestamp: entry
                .timestamp
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
        }
    }
}

impl TryFrom<LogRecord> for LogEntry {
    type Error = time::error::Parse;

    fn try_from(record: LogRecord) -> Result<Self, Self::Error> {
        let level = match record.level.as_str() {
            "Warn" => LogLevel::Warn,
            "Error" => LogLevel::Error,
            _ => LogLevel::Info,
        };
        let timestamp = time::OffsetDateTime::parse(
            &record.timestamp,
            &time::format_description::well_known::Rfc3339,
        )?;
        Ok(Self {
            job_id: record.job_id,
            job_type: record.job_type,
            level,
            message: record.message,
            timestamp,
        })
    }
}

/// Owns the embedded SurrealDB connection used for the write-only diagnostic
/// job log (→ wiki/decisions/adr-003-embedded-surrealdb.md). Job history/
/// status itself is intentionally NOT persisted here — that was decided
/// against; this only stores per-job log entries for debugging.
#[derive(Clone)]
pub struct JobLog(Surreal<Db>);

impl JobLog {
    /// Opens (or creates) the embedded database under the app's data
    /// directory. Called once from `setup()`.
    pub async fn connect(app_data_dir: &std::path::Path) -> Result<Self, surrealdb::Error> {
        std::fs::create_dir_all(app_data_dir).ok();
        let path = app_data_dir.join("diagnostics.skv");
        let db = Surreal::new::<SurrealKv>(path.to_string_lossy().into_owned()).await?;
        db.use_ns("swiss_kyle").use_db("diagnostics").await?;
        Ok(Self(db))
    }

    /// Most recent log entries, newest first.
    pub async fn recent_logs(&self) -> Result<Vec<LogEntry>, surrealdb::Error> {
        let records: Vec<LogRecord> = self
            .0
            .query("SELECT * FROM job_log ORDER BY timestamp DESC LIMIT 200")
            .await?
            .take(0)?;
        Ok(records
            .into_iter()
            .filter_map(|r| LogEntry::try_from(r).ok())
            .collect())
    }

    async fn write(&self, entry: &LogEntry) -> Result<(), surrealdb::Error> {
        let record = LogRecord::from(entry);
        let _: Option<LogRecord> = self.0.create("job_log").content(record).await?;
        Ok(())
    }
}

/// Subscribes to the worker's diagnostic-log and heartbeat subjects (plain
/// core NATS pub/sub, not JetStream — best-effort, never blocks job
/// processing, → wiki/decisions/adr-002-keep-nats-for-durability.md). Log
/// entries are written to SurrealDB and re-emitted live; heartbeats are
/// ephemeral status only, re-emitted without a DB write.
pub async fn subscribe(app_handle: AppHandle, client: async_nats::Client, job_log: JobLog) {
    let log_handle = app_handle.clone();
    let log_db = job_log.clone();
    let log_client = client.clone();
    tauri::async_runtime::spawn(async move {
        let mut subscriber = match log_client.subscribe(LOG_SUBJECT).await {
            Ok(s) => s,
            Err(e) => {
                log::error!("failed to subscribe to job log: {:?}", e);
                return;
            }
        };
        while let Some(message) = subscriber.next().await {
            match serde_json::from_slice::<LogEntry>(&message.payload) {
                Ok(entry) => {
                    if let Err(e) = log_db.write(&entry).await {
                        log::error!("failed to write job log entry: {:?}", e);
                    }
                    let _ = log_handle.emit("job-log", entry);
                }
                Err(e) => log::error!("failed to deserialize job log entry: {:?}", e),
            }
        }
    });

    tauri::async_runtime::spawn(async move {
        let mut subscriber = match client.subscribe(WORKERS_HEARTBEAT_SUBJECT).await {
            Ok(s) => s,
            Err(e) => {
                log::error!("failed to subscribe to worker heartbeats: {:?}", e);
                return;
            }
        };
        while let Some(message) = subscriber.next().await {
            match serde_json::from_slice::<WorkerHeartbeat>(&message.payload) {
                Ok(heartbeat) => {
                    let _ = app_handle.emit("worker-status", heartbeat);
                }
                Err(e) => log::error!("failed to deserialize worker heartbeat: {:?}", e),
            }
        }
    });
}
