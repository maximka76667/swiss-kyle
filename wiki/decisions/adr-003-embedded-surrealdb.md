# ADR-003: Embedded SurrealDB Over SQLite

**Type**: decision
**Summary**: Job-history persistence will use SurrealDB embedded via a local storage engine, not a remote server — chosen over SQLite to let the user use/learn SurrealDB while still satisfying the internet-free requirement.
**Tags**: #decision #database #surrealdb
**Sources**: [[docs/DESIGN.md]]
**Related**: [[wiki/decisions/adr-001-local-only]], [[wiki/issues/missing-db-and-progress]]
**Last Updated**: 2026-06-22

---

## Overview

The original design used SurrealDB as a remote server alongside the VPS-hosted API and NATS. During the local-only pivot, the first instinct was to drop SurrealDB for something simpler (SQLite, or no DB at all), since a remote DB connection conflicts with "internet-free." It was pointed out that SurrealDB also supports an embedded mode (the `surrealdb` crate with a local storage engine, e.g. RocksDB), which is just as internet-free as SQLite — so there was no need to give it up.

## Details

Decision: keep SurrealDB, but embedded rather than connected-to-over-the-network. Role in the design is unchanged from the original: stores job records (metadata, status, timestamps — no file paths, since the user manages files locally) through the lifecycle `pending → processing → done`/`failed`. A shared `db` crate/module (used by both the worker and the Tauri app) holds the embedded connection logic and query functions.

## Decisions & Rationale

Alternative considered: SQLite. More battle-tested for this scale of local job-history store, but rejected because the user explicitly wants to use SurrealDB. Alternative considered: no DB at all (in-memory only) — viable for a quick backend v1 (see [[wiki/issues/missing-db-and-progress]]) but loses job history across app restarts, which the design wants.

## Known Issues / Tech Debt

Not yet implemented in code — no `surrealdb` dependency, no `db` crate exists yet. Backend v1 explicitly deferred this work (status is currently just console logging in the worker) — see [[wiki/issues/missing-db-and-progress]].

## Related

[[wiki/decisions/adr-001-local-only]], [[wiki/issues/missing-db-and-progress]]
