# System Design

## Overview

A media processing platform where users submit video jobs via a Tauri desktop app and workers run locally on the user's machine. Everything runs on-device — no internet connection or remote server required.

## Components

### Tauri Desktop App

- Frontend submits jobs via HTTP to the API
- Websocket connection to backend for real-time progress and completion events
- Single file system access point — receives completed file path from worker and saves to user's local folder
- On macOS, the worker sidecar may not inherit the app's security-scoped
  access to user-picked files. If the worker reports it can't open the
  input path, the Tauri app copies the file to a location the worker can
  read and retries — copying is a fallback, not the default, to avoid
  doubling disk I/O for large videos on every job.
- Watches the output folder and shows files in the UI (no need to store paths in DB)
- Bundles the worker as a sidecar binary, starts/stops it automatically
- System tray support — worker keeps running when UI is closed, notifies on completion
- Has auto-updater built in

### Worker (sidecar)

- Runs on the user's machine, bundled inside the Tauri app
- Connects to NATS JetStream and pulls jobs one at a time
- Spawns ffmpeg as a subprocess, parses stderr for progress percentage
- Publishes progress to NATS so backend can forward to websocket
- Multiple workers can run in parallel (one per CPU core)
- On completion, sends result path back to Tauri (not directly to disk)
- Writes job status to the embedded SurrealDB directly

### Tauri App (job submission + coordination)

- Replaces the standalone HTTP API — the Tauri app calls job-publishing logic directly (in-process, via the shared crate) instead of going over HTTP to a separate service
- Writes initial job record to SurrealDB with status `pending`
- Subscribes to NATS for progress and completion events, forwards to the frontend via Tauri events (no websocket needed — everything is one machine)

### NATS + JetStream

- Runs locally, bound to `localhost` only — started/stopped by the Tauri app (or bundled as its own sidecar)
- Never exposed to the network, so no auth/TLS hardening needed
- JetStream ensures jobs are not lost if a worker crashes — job stays queued until acked (this durability is a hard requirement, which is why NATS is kept instead of an in-process queue)
- Workers pull one job at a time (dynamic load balancing, not round robin)

### SurrealDB (embedded)

- Embedded via the `surrealdb` crate with a local storage engine (e.g. RocksDB), not a remote server connection
- Stores job records: metadata, status, timestamps (no file paths — user manages files locally)
- Job lifecycle: `pending` → `processing` → `done` (or `failed`)
- Both the worker and the Tauri app write to it directly
- A common `db` crate shared by the Tauri app and workers contains the embedded SurrealDB connection logic and all query functions

## Job Types

```rust
pub enum Job {
    CutVideo(CutVideo),
    // Future: DownloadVideo, Transcode, ExtractAudio
}

pub struct CutVideo {
    pub input: String,
    pub output: String,
    pub start_secs: f64,
    pub end_secs: f64,
}
```

## Deployment

- No server, no VPS — NATS+JetStream and SurrealDB both run locally on the user's machine
- App works fully offline; internet is never required
- Trade-off versus the original VPS design: no cross-device job history, no
  future multi-user support without revisiting this. Accepted since
  internet-free operation is a hard requirement.

## Progress Reporting

- ffmpeg outputs progress to stderr (`time=` field)
- Worker parses it, calculates percentage from total duration
- Publishes progress events to NATS
- Tauri app subscribes directly and forwards to the frontend via Tauri events
