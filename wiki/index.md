# Wiki Index

_Last updated: 2026-06-28_

## Architecture

- [[wiki/architecture/system-overview]] — Local-only media pipeline: Tauri app → NATS JetStream → workers → ffmpeg, with embedded SurrealDB for job state

## Components

- [[wiki/components/job-types]] — `JobEnvelope`, `Job`/`CutVideo`, `JobStatus`/`StatusEvent` — all NATS message types
- [[wiki/components/publisher]] — Shared `Publisher` struct: connects to NATS, durably publishes jobs
- [[wiki/components/worker]] — `main.rs`: pulls jobs, runs ffmpeg, streams progress via mpsc, publishes StatusEvents
- [[wiki/components/cli-publisher]] — `publisher.rs`: CLI for manually submitting jobs
- [[wiki/components/http-api]] — `api.rs`: Axum HTTP/websocket service (replaced by Tauri app)
- [[wiki/components/tauri-app]] — `src-tauri/src/lib.rs`: sidecar orchestration, Tauri commands, NATS status relay
- [[wiki/components/video-server]] — `src-tauri/src/video_server.rs`: local Axum server serving videos with HTTP range support
- [[wiki/components/frontend]] — `swiss-kyle-ui/`: React/TS app with VideoPlayer, TimelineSlider, CutVideo, JobHistory

## Decisions

- [[wiki/decisions/adr-001-local-only]] — Dropped the VPS backend; everything runs on-device, no internet required
- [[wiki/decisions/adr-002-keep-nats-for-durability]] — Kept NATS+JetStream instead of an in-process queue, for crash durability
- [[wiki/decisions/adr-003-embedded-surrealdb]] — Embedded SurrealDB (not remote) chosen over SQLite

## Concepts

- [[wiki/concepts/jetstream-pull-consumer]] — How multiple workers share one durable consumer for dynamic load balancing

## Dependencies

- [[wiki/dependencies/async-nats]] — NATS/JetStream client
- [[wiki/dependencies/axum]] — HTTP framework (used in video-server and formerly in api.rs)

## Questions

_(empty)_

## Issues

- [[wiki/issues/missing-db-and-progress]] — Progress reporting done; SurrealDB persistence still missing
- [[wiki/issues/api-rs-obsolescence]] — Resolved: Tauri app now handles job submission and status forwarding in-process
- [[wiki/issues/user-friendly-process-errors]] — ffmpeg/pandoc errors shown as raw stderr; should map known patterns to plain-language guidance
