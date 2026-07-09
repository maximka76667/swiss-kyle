use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Globally unique, URL-safe id (ULID).
pub fn new_id() -> String {
    ulid::Ulid::new().to_string()
}

/// In debug builds, overridable via `.env.development` at the repo root (keeps
/// dev/test job output out of the user's real Documents folder). Never
/// active in release builds.
pub fn base_output_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        if let Some(dir) = dev_output_dir_override() {
            return dir;
        }
    }
    dirs::document_dir()
        .unwrap_or_else(|| dirs::home_dir().expect("no home dir").join("Documents"))
        .join("swiss-kyle")
}

/// Reads `SWISS_KYLE_OUTPUT_DIR=<name>` from `.env.development` at the repo
/// root. The app and worker are separate processes that don't reliably
/// share environment variables (tauri-driver, used by e2e tests, doesn't
/// forward its own env down to the app it launches), so this reads a real
/// file instead — anchored via `CARGO_MANIFEST_DIR` (baked in at compile
/// time), not the process's CWD, so it resolves identically regardless of
/// how or from where each process was launched.
///
/// The result always lands under `<repo root>/.development/` (gitignored
/// wholesale) regardless of what's written in the file — only the value's
/// base name is used, so a stray absolute path or `..` in `.env.development`
/// can't escape it.
fn dev_output_dir_override() -> Option<PathBuf> {
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let contents = std::fs::read_to_string(repo_root.join(".env.development")).ok()?;
    let value = contents
        .lines()
        .find_map(|l| l.strip_prefix("SWISS_KYLE_OUTPUT_DIR="))?
        .trim();
    let name = std::path::Path::new(value).file_name()?;
    Some(repo_root.join(".development").join(name))
}

pub fn output_dir(tool: &str) -> PathBuf {
    base_output_dir().join(tool)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JobEnvelope {
    pub id: String,
    pub job: Job,
}

impl JobEnvelope {
    pub fn new(job: Job) -> Self {
        Self { id: new_id(), job }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub enum Job {
    CutVideo(CutVideo),
    ConvertDocument(ConvertDocument),
    MergePdfs(MergePdfs),
}

impl Job {
    pub fn type_name(&self) -> &'static str {
        match self {
            Job::CutVideo(_) => "cut-video",
            Job::ConvertDocument(_) => "convert-document",
            Job::MergePdfs(_) => "merge-pdfs",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CutVideo {
    pub input: String,
    pub output: String,
    pub start_secs: f64,
    pub end_secs: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConvertDocument {
    pub input: String,
    pub output_stem: String,
    pub to_format: DocFormat,
    /// Only relevant when converting office files (doc/docx/odt/rtf) to PDF
    pub converter: Option<Converter>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MergePdfs {
    /// Merge order, at least 2 inputs.
    pub inputs: Vec<String>,
    pub output_stem: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum DocFormat {
    Markdown,
    Docx,
    Html,
    Pdf,
}

impl DocFormat {
    pub fn extension(&self) -> &'static str {
        match self {
            DocFormat::Markdown => "md",
            DocFormat::Docx => "docx",
            DocFormat::Html => "html",
            DocFormat::Pdf => "pdf",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum Converter {
    /// Microsoft Word via COM automation (Windows only)
    Word,
    LibreOffice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JobStatus {
    Received,
    Processing { percent: f64 },
    Done,
    Failed { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusEvent {
    pub id: String,
    pub status: JobStatus,
}

pub const STATUS_SUBJECT: &str = "jobs.status";

pub async fn publish_status(
    client: &async_nats::Client,
    event: &StatusEvent,
) -> Result<(), async_nats::Error> {
    let payload = serde_json::to_vec(event)?;
    client.publish(STATUS_SUBJECT, payload.into()).await?;
    Ok(())
}

/// Diagnostic job log — best-effort, not job-critical. Published over core
/// NATS (not JetStream) alongside `StatusEvent`, so a backed-up subscriber
/// can never delay job submission/processing, only drop log entries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub job_id: String,
    pub job_type: String,
    pub level: LogLevel,
    pub message: String,
    #[serde(with = "time::serde::rfc3339")]
    pub timestamp: time::OffsetDateTime,
}

pub const LOG_SUBJECT: &str = "jobs.log";

pub async fn publish_log(
    client: &async_nats::Client,
    entry: &LogEntry,
) -> Result<(), async_nats::Error> {
    let payload = serde_json::to_vec(entry)?;
    client.publish(LOG_SUBJECT, payload.into()).await?;
    Ok(())
}

/// Worker liveness/status, published on an interval independent of any
/// single job. Unrelated to JetStream's ack-progress heartbeat (which only
/// resets a message's redelivery timer) — this is for UI display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkerState {
    Idle,
    Busy { job_id: String },
    /// Alive (still sending heartbeats) but its JetStream fetch loop is
    /// erroring — e.g. can't reach NATS. Distinct from "offline", which the
    /// UI infers client-side from a heartbeat that stopped arriving at all.
    Error { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkerHeartbeat {
    pub worker_id: usize,
    pub state: WorkerState,
    #[serde(with = "time::serde::rfc3339")]
    pub timestamp: time::OffsetDateTime,
}

pub const WORKERS_HEARTBEAT_SUBJECT: &str = "workers.heartbeat";

pub async fn publish_heartbeat(
    client: &async_nats::Client,
    heartbeat: &WorkerHeartbeat,
) -> Result<(), async_nats::Error> {
    let payload = serde_json::to_vec(heartbeat)?;
    client
        .publish(WORKERS_HEARTBEAT_SUBJECT, payload.into())
        .await?;
    Ok(())
}

pub struct Publisher {
    client: async_nats::Client,
    jetstream: async_nats::jetstream::Context,
}

impl Publisher {
    pub async fn connect() -> Result<Self, async_nats::Error> {
        let client = async_nats::connect("nats://localhost:4222").await?;
        let jetstream = async_nats::jetstream::new(client.clone());

        jetstream
            .get_or_create_stream(async_nats::jetstream::stream::Config {
                name: "JOBS".to_string(),
                subjects: vec!["jobs".to_string()],
                ..Default::default()
            })
            .await?;

        Ok(Self { client, jetstream })
    }

    pub fn client(&self) -> &async_nats::Client {
        &self.client
    }

    pub async fn publish(&self, job: &JobEnvelope) -> Result<(), async_nats::Error> {
        let payload = serde_json::to_vec(job).unwrap();
        self.jetstream
            .publish("jobs", payload.into())
            .await?
            .await?;
        Ok(())
    }
}
