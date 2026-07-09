# Missing DB Persistence

**Type**: issue
**Summary**: Resolved as won't-do. ffmpeg progress reporting is implemented and live in the Tauri frontend; full SurrealDB job-status persistence (the original ask below) was decided against — job history stays disposable/in-memory. A narrower successor (a write-only diagnostic log) survives under [[wiki/decisions/adr-003-embedded-surrealdb]].
**Tags**: #issue #resolved #wont-do #scope #backend-v1
**Sources**: [[crates/worker/src/main.rs]], [[docs/DESIGN.md]]
**Related**: [[wiki/components/worker]], [[wiki/decisions/adr-003-embedded-surrealdb]]
**Last Updated**: 2026-07-09

---

## Overview

`docs/DESIGN.md` specifies that job status (`pending → processing → done`/`failed`) should be persisted to SurrealDB. Progress reporting via ffmpeg stderr parsing has been implemented (→ [[wiki/components/worker]]) and wired through to the frontend. What remained missing was SurrealDB persistence — this issue tracked that gap.

That gap is now closed as **won't-do**: no functional need for restart-durable job history was ever identified, and in-memory-only history (current frontend behavior, resets on restart) is an acceptable default for a local single-user tool. This isn't being fixed later; it's the intended design.

## Details

**Implemented**: The worker parses ffmpeg's stderr `time=` field and publishes `Processing { percent }` events on `jobs.status`. The Tauri app subscribes and re-emits them as `job-status` Tauri events. The frontend renders per-job progress bars in real time.

**Decided against**: No `db` crate, no `surrealdb` dependency, no `pending`/`processing`/`done`/`failed` records written anywhere. Job history stays in-memory in the React frontend only, resetting on app restart — by decision, not by omission.

**Successor scope**: SurrealDB is still being added, but for a different purpose — a write-only diagnostic job log (per-job entries including intermediate/detail steps, not a status record), surfaced via a new in-app Logs page. See [[wiki/decisions/adr-003-embedded-surrealdb]] for the current scope.

## Decisions & Rationale

Originally "deferred rather than dropped." Revisited and dropped for the job-history/status-persistence use case specifically — see [[wiki/decisions/adr-003-embedded-surrealdb]] for the full reasoning. SurrealDB itself is not dropped; only this issue's original ask (persisted, resumable job status) is.

## Known Issues / Tech Debt

None — this is now a closed decision, not an open gap. Any future SurrealDB work is tracked under [[wiki/decisions/adr-003-embedded-surrealdb]] instead.

## Related

[[wiki/components/worker]], [[wiki/decisions/adr-003-embedded-surrealdb]], [[wiki/components/tauri-app]]
