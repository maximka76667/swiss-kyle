# Tauri App

**Type**: component
**Summary**: `src-tauri/src/lib.rs` — the Tauri backend that orchestrates sidecar lifecycle, exposes Tauri commands to the frontend, subscribes to NATS status events, and bridges them to the UI via Tauri events.
**Tags**: #component #tauri #sidecar #nats
**Sources**: [[src-tauri/src/lib.rs]], [[src-tauri/Cargo.toml]]
**Related**: [[wiki/components/job-types]], [[wiki/components/worker]], [[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/decisions/adr-001-local-only]]
**Last Updated**: 2026-07-02

---

## Overview

`lib.rs` is the entry point for the Tauri backend. On startup it starts all sidecars (nats-server and one worker per CPU core), connects a `Publisher`, starts the video HTTP server, and subscribes to NATS status events. It exposes four Tauri commands to the React frontend. On exit it kills all sidecar processes.

## Details

### Startup sequence

1. Start the video server; store its `(port, Arc<Registry>)` in `VideoServer` managed state (→ [[wiki/components/video-server]]).
2. Spawn `nats-server -js -D` as a sidecar; log its stdout/stderr.
3. Retry-connect a `Publisher` (up to 40 attempts × 250 ms = 10 s) to wait for nats-server to be ready.
4. Clone the NATS client; spawn a background task that subscribes to `STATUS_SUBJECT` (`jobs.status`), deserializes each `StatusEvent`, and calls `app_handle.emit("job-status", event)`.
5. Resolve the ffmpeg/pandoc/typst binary paths and spawn one `worker` sidecar per `std::thread::available_parallelism()` core, passing the worker index as argv[1] and the binary paths as env vars.
6. Store all `CommandChild` handles in `Sidecars` managed state.

### Tauri commands

| Command | Signature | Purpose |
|---|---|---|
| `submit_cut_job` | `(input, output, start_secs, end_secs) → Result<String>` | Wraps args in `JobEnvelope::CutVideo`, publishes via `Publisher`, returns the job ULID |
| `submit_doc_convert_job` | `(input, output_stem, to_format, converter) → Result<String>` | Wraps args in `JobEnvelope::ConvertDocument`, publishes, returns the job ULID |
| `get_stream_url` | `(path) → String` | Registers `path` with the video server and returns a token URL to stream it |
| `open_output_folder` | `(subfolder) → Result<()>` | Opens `~/Documents/swiss-kyle/<subfolder>/` in the OS file manager |

### Shutdown

On `RunEvent::ExitRequested`, the app drains `Sidecars` and calls `.kill()` on each `CommandChild`. This ensures nats-server and all workers stop cleanly with the UI window.

### Sidecar binaries

Binaries live in `src-tauri/binaries/` under Tauri's naming convention (`<name>-<target-triple>[.exe]`, e.g. `worker-x86_64-unknown-linux-gnu` or `worker-x86_64-pc-windows-msvc.exe`); `tauri.conf.json` lists the base names (`nats-server`, `worker`, `ffmpeg`, `pandoc`, `typst`) in `bundle.externalBin` and Tauri appends the triple per platform.

They are produced by `prepare-sidecars.ts` (run via `bun`), which Tauri invokes in `beforeDevCommand`/`beforeBuildCommand`. The script detects the host triple from `rustc -vV`, always rebuilds `worker` from source, and downloads pinned versions of nats-server, ffmpeg, pandoc, and typst for that triple. Downloads are defined for Linux (x86_64/aarch64), macOS (x86_64/aarch64), and Windows (msvc/gnu); an unrecognized triple errors with a "place the binary manually" message. Existing non-worker binaries are left in place (skipped if already present), so the build is cross-platform — each host populates its own triple's binaries.

## Decisions & Rationale

The Tauri app replaces the standalone `api.rs` HTTP service — it calls `Publisher::publish` in-process and uses Tauri events instead of websockets for progress forwarding. This avoids a network round-trip on the same machine and removes the standalone HTTP service from the deployment (→ [[wiki/issues/api-rs-obsolescence]]).

## Known Issues / Tech Debt

- No SurrealDB write on job submission — initial `pending` record not created (→ [[wiki/issues/missing-db-and-progress]]).
- `Publisher::connect` panic after 10 s is a hard crash; there's no graceful degradation if nats-server fails to start.

## Related

[[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/components/job-types]], [[wiki/components/worker]]
