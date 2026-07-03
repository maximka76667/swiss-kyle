# Tauri App

**Type**: component
**Summary**: `src-tauri/src/lib.rs` — the Tauri backend that orchestrates sidecar lifecycle, exposes Tauri commands to the frontend, subscribes to NATS status events, and bridges them to the UI via Tauri events.
**Tags**: #component #tauri #sidecar #nats
**Sources**: [[src-tauri/src/lib.rs]], [[src-tauri/Cargo.toml]]
**Related**: [[wiki/components/job-types]], [[wiki/components/worker]], [[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/decisions/adr-001-local-only]], [[wiki/decisions/adr-004-private-sidecar-resources]]
**Last Updated**: 2026-07-03

---

## Overview

`lib.rs` is the entry point for the Tauri backend. On startup it cleans up any sidecars orphaned by a previous abnormal exit, starts all sidecars (nats-server and one worker per CPU core), connects a `Publisher`, starts the video HTTP server, and subscribes to NATS status events. It exposes six Tauri commands to the React frontend. On exit it kills all sidecar processes and clears its PID-tracking file.

## Details

### Startup sequence

1. Manage empty `Sidecars` state, then call `kill_leftover_sidecars()`: reads a `.sidecar-pids` file (if left behind by a previous run that didn't exit cleanly) and kills only PIDs that are both still alive and verified — via the `sysinfo` crate — to have an executable path inside this app's own resource directory. Never kills by name/pattern (→ [[wiki/issues/prepare-sidecars-pkill-broad-match]]).
2. Start the video server; store its `(port, Arc<Registry>)` in `VideoServer` managed state (→ [[wiki/components/video-server]]).
3. Resolve `nats-server`'s path via `resolve_bin()` and spawn it (`app.shell().command(path).args(["-js", "-D"])`, not `.sidecar()` — see Sidecar binaries below); log its stdout/stderr.
4. Retry-connect a `Publisher` (up to 40 attempts × 250 ms = 10 s) to wait for nats-server to be ready. On failure, calls `fatal()`.
5. Clone the NATS client; spawn a background task that subscribes to `STATUS_SUBJECT` (`jobs.status`), deserializes each `StatusEvent`, and calls `app_handle.emit("job-status", event)`.
6. Resolve `ffmpeg`/`pandoc`/`typst`/`pdfcpu` and `worker` paths via `resolve_bin()`, then spawn one `worker` process per `std::thread::available_parallelism()` core (capped at 4 — I/O-bound jobs and externally-serialized converters don't benefit from more), passing the worker index as argv[1] and the four tool paths as env vars (`FFMPEG_BIN`, `PANDOC_BIN`, `TYPST_BIN`, `PDFCPU_BIN`).
7. Store all `CommandChild` handles in `Sidecars` managed state; write their PIDs to `.sidecar-pids` via `write_sidecar_pids()`.

Any resolution/spawn failure at any step calls `fatal()`, which kills already-spawned sidecars, shows a blocking error dialog, and exits (see Known Issues for why this used to hang silently).

### Tauri commands

| Command | Signature | Purpose |
|---|---|---|
| `submit_cut_job` | `(input, output, start_secs, end_secs) → Result<String>` | Wraps args in `JobEnvelope::CutVideo`, publishes via `Publisher`, returns the job ULID |
| `submit_doc_convert_job` | `(input, output_stem, to_format, converter) → Result<String>` | Wraps args in `JobEnvelope::ConvertDocument`, publishes, returns the job ULID |
| `submit_merge_pdfs_job` | `(inputs, output_stem) → Result<String>` | Wraps args in `JobEnvelope::MergePdfs` (requires ≥2 inputs), publishes, returns the job ULID |
| `get_pdf_page_count` | `(path) → Result<u32>` | Runs `pdfcpu info --json` (blocking, off the async runtime) for the merge-order picker UI; no rasterization capability, so this is the closest thing to a thumbnail count available |
| `get_stream_url` | `(path) → String` | Registers `path` with the video server and returns a token URL to stream it |
| `open_output_folder` | `(subfolder) → Result<()>` | Opens `~/Documents/swiss-kyle/<subfolder>/` in the OS file manager |

Commands live in `src-tauri/src/commands.rs` (extracted from `lib.rs`).

### Shutdown

On `RunEvent::ExitRequested`/`RunEvent::Exit`, the app drains `Sidecars` and calls `.kill()` on each `CommandChild`, then deletes `.sidecar-pids`. This ensures a clean exit never looks like a leftover run to `kill_leftover_sidecars()` on the next launch.

### Sidecar binaries

All six bundled tools (`nats-server`, `worker`, `ffmpeg`, `pandoc`, `typst`, `pdfcpu`) are declared under `bundle.resources` in `tauri.conf.json` as glob maps (e.g. `"binaries/ffmpeg-*": "bin/"`), **not** `bundle.externalBin`. `resolve_bin()` finds each one at `resource_dir().join("bin").join("{name}-{TAURI_ENV_TARGET_TRIPLE}{ext}")` — one function, no fallback chain, for all six. This resolves consistently in both dev and packaged builds because Tauri's `resources` copying (in `tauri-build`'s build script) runs on every `cargo build`, not just full bundling.

This replaced an earlier `externalBin`-based design after two real production bugs (→ [[wiki/decisions/adr-004-private-sidecar-resources]], → [[wiki/issues/sidecar-path-resolution-usr-bin-collision]]): `externalBin` sidecars resolve next to the main executable, which for a `.deb` install is `/usr/bin` — a shared system directory that collided with real installed packages (`ffmpeg`, `nats-server`), and didn't match where the old `resolve_bin()` was looking anyway (causing packaged builds to silently hang on startup). `tauri.conf.json` also sets `"mainBinaryName": "swiss-kyle"` (was defaulting to the Cargo package name `app`), so the private resource directory is `/usr/lib/swiss-kyle/bin/` on Linux, not `/usr/lib/app/bin/`.

`nats-server`/`worker` are spawned via `app.shell().command(resolved_path)` rather than `app.shell().sidecar(name)`, since `.sidecar()` requires `externalBin` registration and does its own next-to-exe resolution. Confirmed empirically that this needs no `capabilities/default.json` permission changes — that capability system only gates frontend-initiated (webview → Rust) calls, not calls made directly from this app's own Rust code.

Binaries are produced by `prepare-sidecars.ts` (run via `bun`), which Tauri invokes in `beforeDevCommand`/`beforeBuildCommand`, and placed at `src-tauri/binaries/<name>-<target-triple>[.exe]`. The script detects the host triple from `rustc -vV`, always rebuilds `worker` from source, and downloads pinned versions of nats-server, ffmpeg, pandoc, typst, and pdfcpu for that triple. Downloads are defined for Linux (x86_64/aarch64), macOS (x86_64/aarch64), and Windows (msvc/gnu); an unrecognized triple errors with a "place the binary manually" message. Existing non-worker binaries are left in place (skipped if already present, verified by size only — no checksum), so the build is cross-platform — each host populates its own triple's binaries. Before rebuilding, the script kills any sidecars left running from a previous crashed run by reading the same `.sidecar-pids` file and verifying each PID (→ [[wiki/issues/prepare-sidecars-pkill-broad-match]] for why this used to `pkill -f` by name instead).

## Decisions & Rationale

The Tauri app replaces the standalone `api.rs` HTTP service — it calls `Publisher::publish` in-process and uses Tauri events instead of websockets for progress forwarding. This avoids a network round-trip on the same machine and removes the standalone HTTP service from the deployment (→ [[wiki/issues/api-rs-obsolescence]]).

`fatal()` shows its error dialog via `tauri_plugin_dialog` configured with the `xdg-portal` feature, not its default `gtk` backend (→ [[wiki/issues/fatal-dialog-hang-linux]]) — the default backend hangs with nothing shown when called from `setup()` on Linux, since GTK needs its own event loop already running and `setup()` runs before Tauri's loop starts.

## Known Issues / Tech Debt

- No SurrealDB write on job submission — initial `pending` record not created (→ [[wiki/issues/missing-db-and-progress]]).

## Related

[[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/components/job-types]], [[wiki/components/worker]]
