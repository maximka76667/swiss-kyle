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

/// Storage and display are capped at the same number of entries — this is a
/// write-only diagnostic log, not history, so there's no reason to keep more
/// than what's ever shown.
const MAX_LOG_ENTRIES: usize = 200;

/// Owns the embedded SurrealDB connection used for the write-only diagnostic
/// job log (→ wiki/decisions/adr-003-embedded-surrealdb.md). Job history/
/// status itself is intentionally NOT persisted here — that was decided
/// against; this only stores per-job log entries for debugging.
#[derive(Clone)]
pub struct JobLog(Surreal<Db>);

impl JobLog {
    /// Opens (or creates) the embedded database under the app's data
    /// directory, and (re)defines the prune-on-create event that keeps
    /// `job_log` capped at `MAX_LOG_ENTRIES` (idempotent via `OVERWRITE`, so
    /// this is safe to redefine on every launch). Called once from `setup()`.
    pub async fn connect(app_data_dir: &std::path::Path) -> Result<Self, surrealdb::Error> {
        std::fs::create_dir_all(app_data_dir).ok();
        let path = app_data_dir.join("diagnostics.skv");
        let db = Surreal::new::<SurrealKv>(path.to_string_lossy().into_owned()).await?;
        db.use_ns("swiss_kyle").use_db("diagnostics").await?;

        // Below MAX_LOG_ENTRIES rows, `SELECT VALUE ... LIMIT 1 START n`
        // returns an empty array — not NONE — so `$threshold != NONE` never
        // actually guards anything, and `timestamp < <empty array>` matches
        // every row in SurrealQL. Without the `array::len($threshold) > 0`
        // guard below, this deletes the entire table on every single create
        // until the count first reaches MAX_LOG_ENTRIES, instead of pruning
        // nothing. Confirmed directly: a test inspecting the subquery's raw
        // result showed `Array([])` for the empty case, not `NONE` — a
        // first attempt using `!= NONE` was written, tested, and failed
        // before this fix was applied.
        db.query(format!(
            "DEFINE EVENT OVERWRITE prune_job_log ON TABLE job_log
             WHEN $event = \"CREATE\"
             THEN {{
                 LET $threshold = (SELECT VALUE timestamp FROM job_log ORDER BY timestamp DESC LIMIT 1 START {});
                 DELETE job_log WHERE array::len($threshold) > 0 AND timestamp < $threshold[0];
             }};",
            MAX_LOG_ENTRIES - 1
        ))
        .await?;

        Ok(Self(db))
    }

    /// Most recent log entries, newest first.
    pub async fn recent_logs(&self) -> Result<Vec<LogEntry>, surrealdb::Error> {
        let records: Vec<LogRecord> = self
            .0
            .query(format!(
                "SELECT * FROM job_log ORDER BY timestamp DESC LIMIT {MAX_LOG_ENTRIES}"
            ))
            .await?
            .take(0)?;
        Ok(records
            .into_iter()
            .filter_map(|r| LogEntry::try_from(r).ok())
            .collect())
    }

    /// The `prune_job_log` event defined in `connect()` keeps `job_log`
    /// capped at `MAX_LOG_ENTRIES` automatically — nothing extra needed here.
    async fn write(&self, entry: &LogEntry) -> Result<(), surrealdb::Error> {
        let record = LogRecord::from(entry);
        let _: Option<LogRecord> = self.0.create("job_log").content(record).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Removes its temp dir on drop, including on panic/assertion failure —
    /// a plain `remove_dir_all` call at the end of a test never runs once
    /// an `.expect()`/`assert_eq!` earlier in the same test panics, since
    /// that unwinds straight past it. Confirmed leaking real directories
    /// under /tmp across two failed runs before this existed.
    struct TempTestDir(std::path::PathBuf);

    impl TempTestDir {
        fn new(prefix: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "{prefix}-{}-{}",
                std::process::id(),
                time::OffsetDateTime::now_utc().unix_timestamp_nanos()
            ));
            std::fs::create_dir_all(&dir).ok();
            Self(dir)
        }
    }

    impl std::ops::Deref for TempTestDir {
        type Target = std::path::Path;
        fn deref(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TempTestDir {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).ok();
        }
    }

    #[tokio::test]
    async fn write_prunes_to_max_log_entries() {
        let dir = TempTestDir::new("swiss-kyle-joblog-test");
        let job_log = JobLog::connect(&dir).await.expect("connect");

        for i in 0..(MAX_LOG_ENTRIES + 50) {
            let entry = LogEntry {
                job_id: format!("job-{i}"),
                job_type: "cut-video".to_string(),
                level: LogLevel::Info,
                message: format!("entry {i}"),
                timestamp: time::OffsetDateTime::now_utc() + time::Duration::seconds(i as i64),
            };
            job_log.write(&entry).await.expect("write");
        }

        let remaining: Vec<LogRecord> = job_log
            .0
            .query("SELECT * FROM job_log")
            .await
            .expect("query")
            .take(0)
            .expect("take");
        assert_eq!(remaining.len(), MAX_LOG_ENTRIES);

        let recent = job_log.recent_logs().await.expect("recent_logs");
        assert_eq!(recent.len(), MAX_LOG_ENTRIES);
        // Newest-first: the last entry written (highest i, latest timestamp) must survive.
        assert_eq!(recent[0].message, format!("entry {}", MAX_LOG_ENTRIES + 49));
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
