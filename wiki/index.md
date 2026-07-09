# Wiki Index

_Last updated: 2026-07-09_

## Architecture

- [[wiki/architecture/system-overview]] — Local-only pipeline: Tauri app → NATS JetStream → workers → ffmpeg/pandoc+typst

## Components

- [[wiki/components/job-types]] — `JobEnvelope`, `Job`/`CutVideo`/`ConvertDocument`, `JobStatus`/`StatusEvent` — all NATS message types
- [[wiki/components/publisher]] — Shared `Publisher` struct: connects to NATS, durably publishes jobs
- [[wiki/components/worker]] — Pulls jobs, runs ffmpeg (cut-video) or the document converter, streams progress, publishes StatusEvents
- [[wiki/components/tauri-app]] — Sidecar orchestration, Tauri commands, NATS status relay
- [[wiki/components/video-server]] — Local Axum server streaming videos with HTTP range support, token-gated against arbitrary file access
- [[wiki/components/frontend]] — React/TS app: three tools (Cut Video, Doc Converter, Merge PDFs), drag-drop, router-based navigation, job history sidebar
- [[wiki/components/e2e-tests]] — WebdriverIO + tauri-driver suite driving the real packaged app end to end; no mocking
- [[wiki/components/cli-publisher]] — Archived: CLI dev tool for job submission, replaced by Tauri app
- [[wiki/components/http-api]] — Archived: Axum HTTP API from VPS-backend era, replaced by Tauri app

## Decisions

- [[wiki/decisions/adr-001-local-only]] — Dropped the VPS backend; everything runs on-device, no internet required
- [[wiki/decisions/adr-002-keep-nats-for-durability]] — Kept NATS+JetStream instead of an in-process queue, for crash durability
- [[wiki/decisions/adr-003-embedded-surrealdb]] — Embedded SurrealDB kept, rescoped to a write-only per-job diagnostic log (not job-status persistence)
- [[wiki/decisions/adr-004-private-sidecar-resources]] — Bundled tools moved from externalBin to a private resources directory, not shared /usr/bin

## Concepts

- [[wiki/concepts/jetstream-pull-consumer]] — How multiple workers share one durable consumer for dynamic load balancing

## Dependencies

- [[wiki/dependencies/async-nats]] — NATS/JetStream client
- [[wiki/dependencies/axum]] — HTTP framework (used in video-server)

## Questions

_(empty)_

## Issues

- [[wiki/issues/missing-db-and-progress]] — Resolved as won't-do: full job-status persistence dropped, history stays disposable; narrower diagnostic-log successor tracked in adr-003
- [[wiki/issues/api-rs-obsolescence]] — Resolved: Tauri app now handles job submission and status forwarding in-process
- [[wiki/issues/user-friendly-process-errors]] — ffmpeg/pandoc errors shown as raw stderr tail; should map known patterns to plain-language guidance
- [[wiki/issues/onlyoffice-x2t-broken]] — Resolved: x2t removed from code and UI (crashed on all files); Word/LibreOffice are the converters
- [[wiki/issues/prepare-sidecars-pkill-broad-match]] — Resolved: pkill -f worker matched VS Code's own processes on Linux, closing the editor on every dev run
- [[wiki/issues/sidecar-path-resolution-usr-bin-collision]] — Resolved: packaged builds hung on startup + .deb install conflicts, both from externalBin's /usr/bin placement
- [[wiki/issues/fatal-dialog-hang-linux]] — Resolved: fatal()'s error dialog hung silently on Linux (GTK event-loop timing); fixed with xdg-portal
- [[wiki/issues/e2e-sidecar-leak-across-specs]] — Resolved: a spec that never closed its window orphaned sidecars, failing a later, unrelated spec's process check
- [[wiki/issues/tauri-resource-copy-only-on-app-rebuild]] — Resolved: rebuilding the worker alone doesn't refresh what the running app spawns; only rebuilding `app.exe` does
- [[wiki/issues/webview2-session-crash-on-fast-relaunch]] — Mitigated, not fully resolved: a new WebView2 session launched too soon after the last one closed crashed within ~1.5s; a 4s delay cut it from ~1-in-2 to ~1-in-50, not zero
