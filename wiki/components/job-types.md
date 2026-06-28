# Job Types

**Type**: component
**Summary**: All shared message types for the NATS job pipeline: `JobEnvelope` (wire format), `Job`/`CutVideo` (job payload), and `JobStatus`/`StatusEvent` (progress events).
**Tags**: #component #job-model #status-events
**Sources**: [[crates/shared/src/lib.rs]]
**Related**: [[wiki/components/publisher]], [[wiki/components/worker]], [[wiki/architecture/system-overview]]
**Last Updated**: 2026-06-28

---

## Overview

The `shared` crate defines every message type that crosses a NATS subject boundary. There are two flows: jobs (Tauri app → worker) and status events (worker → Tauri app → frontend). All types derive serde `Serialize`/`Deserialize`.

## Details

### Job envelope (wire format for the `jobs` subject)

```rust
pub struct JobEnvelope {
    pub id: String,   // ULID, generated at submission time
    pub job: Job,
}

impl JobEnvelope {
    pub fn new(job: Job) -> Self {
        Self { id: ulid::Ulid::new().to_string(), job }
    }
}
```

Every message on the `jobs` JetStream subject is a `JobEnvelope`. The `id` travels with the job so workers can tag all status events with the same id, and the frontend can correlate them.

### Job variants

```rust
pub enum Job {
    CutVideo(CutVideo),
}

pub struct CutVideo {
    pub input: String,
    pub output: String,
    pub start_secs: f64,
    pub end_secs: f64,
}
```

`docs/DESIGN.md` lists future variants (`DownloadVideo`, `Transcode`, `ExtractAudio`) that don't exist in code yet.

### Status events (plain NATS subject `jobs.status`)

```rust
pub enum JobStatus {
    Received,
    Processing { percent: f64 },
    Done,
    Failed { reason: String },
}

pub struct StatusEvent {
    pub id: String,
    pub status: JobStatus,
}

pub const STATUS_SUBJECT: &str = "jobs.status";

pub async fn publish_status(
    client: &async_nats::Client,
    event: &StatusEvent,
) -> Result<(), async_nats::Error>;
```

Status events flow on a plain (non-JetStream) NATS subject — they are fire-and-forget notifications, not durable jobs. The Tauri app subscribes to `STATUS_SUBJECT` and re-emits each event as a `job-status` Tauri event to the frontend.

## Decisions & Rationale

The id is a ULID (lexicographically sortable, URL-safe) generated at the point `JobEnvelope::new` is called in the Tauri app. No central id authority is needed.

Status events use a plain NATS subject (not JetStream) because durability is not required — they are live progress signals. If the frontend reconnects mid-job it simply won't see earlier `Processing` frames, which is acceptable.

## Known Issues / Tech Debt

Only `CutVideo` exists; the enum has a single variant so `match` in the worker isn't yet exercised for branching logic.

## Related

[[wiki/components/publisher]], [[wiki/components/worker]], [[wiki/components/tauri-app]], [[wiki/components/frontend]]
