# Tauri App

**Type**: component
**Summary**: `src-tauri/src/lib.rs` — the Tauri backend that orchestrates sidecar lifecycle, exposes Tauri commands to the frontend, subscribes to NATS status events, and bridges them to the UI via Tauri events.
**Tags**: #component #tauri #sidecar #nats
**Sources**: [[src-tauri/src/lib.rs]], [[src-tauri/Cargo.toml]]
**Related**: [[wiki/components/job-types]], [[wiki/components/worker]], [[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/decisions/adr-001-local-only]]
**Last Updated**: 2026-06-28

---

## Overview

`lib.rs` is the entry point for the Tauri backend. On startup it starts all sidecars (nats-server and one worker per CPU core), connects a `Publisher`, starts the video HTTP server, and subscribes to NATS status events. It exposes three Tauri commands to the React frontend. On exit it kills all sidecar processes.

## Details

### Startup sequence

1. Bind the video server on a random local port; store the port in `VideoServerPort` managed state.
2. Spawn `nats-server -js -D` as a sidecar; log its stdout/stderr.
3. Retry-connect a `Publisher` (up to 40 attempts × 250 ms = 10 s) to wait for nats-server to be ready.
4. Clone the NATS client; spawn a background task that subscribes to `STATUS_SUBJECT` (`jobs.status`), deserializes each `StatusEvent`, and calls `app_handle.emit("job-status", event)`.
5. Spawn one `worker` sidecar per `std::thread::available_parallelism()` core, passing the worker index as argv[1].
6. Store all `CommandChild` handles in `Sidecars` managed state.

### Tauri commands

| Command | Signature | Purpose |
|---|---|---|
| `submit_cut_job` | `(input, output, start_secs, end_secs) → Result<String>` | Wraps args in `JobEnvelope`, publishes via `Publisher`, returns the job ULID |
| `get_stream_port` | `() → u16` | Returns the port of the local video HTTP server |
| `open_output_folder` | `() → Result<()>` | Opens `~/Videos/swiss-kyle/` in the OS file manager |

### Shutdown

On `RunEvent::ExitRequested`, the app drains `Sidecars` and calls `.kill()` on each `CommandChild`. This ensures nats-server and all workers stop cleanly with the UI window.

### Sidecar binaries

Pre-compiled binaries must be placed in `src-tauri/binaries/` with Tauri's naming convention (e.g. `worker-x86_64-unknown-linux-gnu`). Both are present for Linux x86_64.

## Decisions & Rationale

The Tauri app replaces the standalone `api.rs` HTTP service — it calls `Publisher::publish` in-process and uses Tauri events instead of websockets for progress forwarding. This avoids a network round-trip on the same machine and removes the standalone HTTP service from the deployment (→ [[wiki/issues/api-rs-obsolescence]]).

## Known Issues / Tech Debt

- No SurrealDB write on job submission — initial `pending` record not created (→ [[wiki/issues/missing-db-and-progress]]).
- `Publisher::connect` panic after 10 s is a hard crash; there's no graceful degradation if nats-server fails to start.

## Related

[[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/components/job-types]], [[wiki/components/worker]]
