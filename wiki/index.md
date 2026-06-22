# Wiki Index

_Last updated: 2026-06-22_

## Architecture

- [[wiki/architecture/system-overview]] — Local-only media pipeline: Tauri app → NATS JetStream → workers → ffmpeg, with embedded SurrealDB for job state

## Components

- [[wiki/components/job-types]] — `Job`/`CutVideo` message types shared over NATS
- [[wiki/components/publisher]] — Shared `Publisher` struct: connects to NATS, durably publishes jobs
- [[wiki/components/worker]] — `subscriber.rs`: pulls jobs, runs ffmpeg, logs status
- [[wiki/components/cli-publisher]] — `publisher.rs`: CLI for manually submitting jobs
- [[wiki/components/http-api]] — `api.rs`: Axum HTTP/websocket service, slated for replacement by Tauri

## Decisions

- [[wiki/decisions/adr-001-local-only]] — Dropped the VPS backend; everything runs on-device, no internet required
- [[wiki/decisions/adr-002-keep-nats-for-durability]] — Kept NATS+JetStream instead of an in-process queue, for crash durability
- [[wiki/decisions/adr-003-embedded-surrealdb]] — Embedded SurrealDB (not remote) chosen over SQLite

## Concepts

- [[wiki/concepts/jetstream-pull-consumer]] — How multiple workers share one durable consumer for dynamic load balancing

## Dependencies

- [[wiki/dependencies/async-nats]] — NATS/JetStream client
- [[wiki/dependencies/axum]] — HTTP framework behind `api.rs`

## Questions

_(empty)_

## Issues

- [[wiki/issues/missing-db-and-progress]] — No SurrealDB writes or ffmpeg progress parsing yet (deliberate v1 scope cut)
- [[wiki/issues/api-rs-obsolescence]] — `api.rs` is temporary scaffolding, to be replaced by in-process Tauri calls
