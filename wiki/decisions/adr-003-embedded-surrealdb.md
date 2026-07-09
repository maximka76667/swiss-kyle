# ADR-003: Embedded SurrealDB Over SQLite

**Type**: decision
**Summary**: SurrealDB is kept, embedded via a local storage engine, but scoped down to a write-only per-job diagnostic log (including intermediate/detail entries, not just a final done/failed record) — not full job-status/history persistence, which was decided to be unnecessary.
**Tags**: #decision #database #surrealdb #logging
**Sources**: [[docs/DESIGN.md]]
**Related**: [[wiki/decisions/adr-001-local-only]], [[wiki/issues/missing-db-and-progress]]
**Last Updated**: 2026-07-09

---

## Overview

The original design used SurrealDB as a remote server alongside the VPS-hosted API and NATS. During the local-only pivot, the first instinct was to drop SurrealDB for something simpler (SQLite, or no DB at all), since a remote DB connection conflicts with "internet-free." It was pointed out that SurrealDB also supports an embedded mode (the `surrealdb` crate with a local storage engine, e.g. RocksDB), which is just as internet-free as SQLite — so there was no need to give it up. The role originally assigned to it, though, was full job-history persistence through a `pending → processing → done`/`failed` lifecycle, intended to survive app restarts.

That full-persistence scope has since been dropped. On reflection, the actual reason for choosing SurrealDB over SQLite (or nothing) was never a functional requirement of the app — it was that the user wants to use/learn SurrealDB. Job history itself was judged disposable: the in-memory-only frontend history (resets on restart) is an acceptable, even preferable, default for a local single-user tool, not a bug to fix.

## Details

Revised decision: keep SurrealDB, embedded, but narrow its role to a **write-only diagnostic log**, not a job-status store. The worker writes log entries as a job runs — not just one record at completion/failure, but intermediate/detail entries too (notable steps, warnings, subprocess output snippets) — useful for debugging "why did this fail" without needing a resumable status lifecycle. This is a per-job log stream, not a `pending → processing → done` record that the app reads back to reconstruct state.

Consumption is via a new in-app **Logs page**: a Tauri command queries SurrealDB and the frontend renders it, rather than an external DB tool (Surreal CLI/Surrealist) — chosen so logs are inspectable without file-lock contention against the embedded engine's single-writer constraint, and so it doubles as a user-facing "why did my last job fail" view, not just a developer debug path.

## Decisions & Rationale

Alternative considered: SQLite. More battle-tested for this scale of local store, but rejected because the user explicitly wants to use SurrealDB — that motivation still holds even with the narrower scope.

Alternative considered (and now the actual decision for the *history* question specifically): no persistence for job status/history at all — in-memory only in the frontend. Originally rejected because the design wanted restart-durable history; now accepted, since no concrete need for that durability was ever identified. SurrealDB survives independently of this, repurposed as a diagnostic log rather than a status store.

## Known Issues / Tech Debt

Not yet implemented in code — no `surrealdb` dependency, no `db`/log module exists yet. Scope, once built, is a `job_log` write path in the worker (multiple entries per job allowed) plus a read command/page in the Tauri app — not a `db` crate with a full CRUD job-status lifecycle. See [[wiki/issues/missing-db-and-progress]] for the history of what was descoped.

## Related

[[wiki/decisions/adr-001-local-only]], [[wiki/issues/missing-db-and-progress]]
