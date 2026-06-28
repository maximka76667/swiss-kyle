# Missing DB Persistence

**Type**: issue
**Summary**: ffmpeg progress reporting is now implemented and live in the Tauri frontend; SurrealDB persistence remains unimplemented — job status is ephemeral in NATS events only.
**Tags**: #issue #scope #backend-v1
**Sources**: [[crates/worker/src/main.rs]], [[docs/DESIGN.md]]
**Related**: [[wiki/components/worker]], [[wiki/decisions/adr-003-embedded-surrealdb]]
**Last Updated**: 2026-06-28

---

## Overview

`docs/DESIGN.md` specifies that job status (`pending → processing → done`/`failed`) should be persisted to SurrealDB. Progress reporting via ffmpeg stderr parsing has been implemented (→ [[wiki/components/worker]]) and wired through to the frontend. What remains missing is SurrealDB persistence.

## Details

**Implemented**: The worker parses ffmpeg's stderr `time=` field and publishes `Processing { percent }` events on `jobs.status`. The Tauri app subscribes and re-emits them as `job-status` Tauri events. The frontend renders per-job progress bars in real time.

**Still missing**: No `db` crate exists. No `surrealdb` dependency in `Cargo.toml`. The Tauri app does not write an initial `pending` record on job submission, and the worker does not write `processing`/`done`/`failed` records. Job history is in-memory in the React frontend only — it resets when the app restarts.

## Decisions & Rationale

Deferred rather than dropped — the embedded-SurrealDB decision (→ [[wiki/decisions/adr-003-embedded-surrealdb]]) remains the intended target; this issue tracks the gap.

## Known Issues / Tech Debt

- No `db` crate/module exists.
- No `surrealdb` dependency in any `Cargo.toml`.
- Job history is lost on app restart.

## Related

[[wiki/components/worker]], [[wiki/decisions/adr-003-embedded-surrealdb]], [[wiki/components/tauri-app]]
