# Wiki Index

_Last updated: 2026-06-28_

## Architecture

- [[wiki/architecture/system-overview]] — Local-only pipeline: Tauri app → NATS JetStream → workers → ffmpeg/pandoc+typst

## Components

- [[wiki/components/job-types]] — `JobEnvelope`, `Job`/`CutVideo`/`ConvertToPdf`, `JobStatus`/`StatusEvent` — all NATS message types
- [[wiki/components/publisher]] — Shared `Publisher` struct: connects to NATS, durably publishes jobs
- [[wiki/components/worker]] — Pulls jobs, runs ffmpeg (cut-video) or pandoc+typst (pdf), streams progress, publishes StatusEvents
- [[wiki/components/tauri-app]] — Sidecar orchestration, Tauri commands, NATS status relay
- [[wiki/components/video-server]] — Local Axum server serving videos with HTTP range support
- [[wiki/components/frontend]] — React/TS app: two tools (Cut Video, PDF Converter), drag-drop, router-based navigation, job history sidebar
- [[wiki/components/cli-publisher]] — Archived: CLI dev tool for job submission, replaced by Tauri app
- [[wiki/components/http-api]] — Archived: Axum HTTP API from VPS-backend era, replaced by Tauri app

## Decisions

- [[wiki/decisions/adr-001-local-only]] — Dropped the VPS backend; everything runs on-device, no internet required
- [[wiki/decisions/adr-002-keep-nats-for-durability]] — Kept NATS+JetStream instead of an in-process queue, for crash durability
- [[wiki/decisions/adr-003-embedded-surrealdb]] — Embedded SurrealDB (not remote) chosen over SQLite

## Concepts

- [[wiki/concepts/jetstream-pull-consumer]] — How multiple workers share one durable consumer for dynamic load balancing

## Dependencies

- [[wiki/dependencies/async-nats]] — NATS/JetStream client
- [[wiki/dependencies/axum]] — HTTP framework (used in video-server)

## Questions

_(empty)_

## Issues

- [[wiki/issues/missing-db-and-progress]] — SurrealDB persistence still planned but not implemented; job history resets on restart
- [[wiki/issues/api-rs-obsolescence]] — Resolved: Tauri app now handles job submission and status forwarding in-process
- [[wiki/issues/user-friendly-process-errors]] — ffmpeg/pandoc errors shown as raw stderr tail; should map known patterns to plain-language guidance
- [[wiki/issues/onlyoffice-x2t-broken]] — x2t crashes on all files (font decoder JS error); remote Word-on-VPS noted as future alternative
