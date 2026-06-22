# Missing DB Persistence and Progress Reporting

**Type**: issue
**Summary**: Backend v1 deliberately ships without SurrealDB writes or ffmpeg progress-percentage parsing — job status exists only as console logging during a run.
**Tags**: #issue #scope #backend-v1
**Sources**: [[src/bin/subscriber.rs]], [[docs/DESIGN.md]]
**Related**: [[wiki/components/worker]], [[wiki/decisions/adr-003-embedded-surrealdb]], [[wiki/components/http-api]]
**Last Updated**: 2026-06-22

---

## Overview

`docs/DESIGN.md` specifies that the worker should parse ffmpeg's stderr `time=` field into a percentage, publish progress to NATS, and write job status (`pending → processing → done`/`failed`) to SurrealDB. None of this is implemented. This was an explicit, deliberate scope cut for backend v1: get a working end-to-end pipeline (publish → queue → worker → ffmpeg) running first, and add persistence/progress afterward.

## Details

Current worker behavior (`src/bin/subscriber.rs`): prints `"Worker {id} processing job"` before running ffmpeg, and `"Worker {id} done"` / `"Worker {id} failed: {err}"` after — visible only in that process's console output, not queryable, not surfaced anywhere else (e.g. `api.rs`'s `/ws/progress` has nothing to forward).

## Decisions & Rationale

Deferred rather than dropped — both the embedded-SurrealDB decision (→ [[wiki/decisions/adr-003-embedded-surrealdb]]) and the NATS-progress-subject design remain the intended target; this issue tracks the gap between that target and the current minimal implementation.

## Known Issues / Tech Debt

- No `db` crate/module exists.
- No `surrealdb` dependency in `Cargo.toml`.
- No ffmpeg stderr capture/parsing in `cut_video`.
- No publish to the `progress` NATS subject.

## Related

[[wiki/components/worker]], [[wiki/decisions/adr-003-embedded-surrealdb]]
