# ADR-001: Local-Only, No VPS

**Type**: decision
**Summary**: Dropped the VPS-hosted NATS/API/SurrealDB design in favor of running everything on the user's machine, so the app works fully offline.
**Tags**: #decision #architecture-pivot #offline
**Sources**: [[docs/DESIGN.md]]
**Related**: [[wiki/architecture/system-overview]], [[wiki/decisions/adr-002-keep-nats-for-durability]], [[wiki/decisions/adr-003-embedded-surrealdb]], [[wiki/issues/api-rs-obsolescence]]
**Last Updated**: 2026-06-22

---

## Overview

The original design ran NATS, the HTTP API, and SurrealDB on a Hetzner VPS (~€4/month), with the Tauri app and worker on the user's machine talking to that remote backend over the internet. This meant the app required internet access even when processing video entirely locally — accepted at the time as a tradeoff for persistent job history and future multi-device/multi-user support.

That tradeoff was reversed: making the app internet-free became a hard requirement.

## Details

Changes made to `docs/DESIGN.md`:

- NATS+JetStream now runs locally, bound to `localhost` only, started/stopped by the Tauri app — never exposed to the network, so no auth/TLS hardening is needed.
- SurrealDB now runs embedded (local storage engine) rather than as a remote server connection (→ [[wiki/decisions/adr-003-embedded-surrealdb]]).
- The standalone HTTP API is dropped as the job-submission path; the Tauri app calls publish logic in-process instead, and subscribes to NATS directly for progress/completion (forwarded via Tauri events instead of a websocket).

## Decisions & Rationale

Three architecture options were considered for worker↔app coordination:

1. **Keep NATS, run it locally** — chosen. Preserves durability (the explicit requirement, → [[wiki/decisions/adr-002-keep-nats-for-durability]]) and requires no rewrite of existing `Publisher`/worker code, just pointing at a local instance instead of a VPS.
2. **Drop NATS, use an in-process queue/channel** — rejected. Only works if the worker is folded into the Tauri app's own process; the worker needs to stay a separate sidecar process (so it can run independently and survive UI restarts/closures), and an in-process channel can't cross that process boundary. Would also lose JetStream's crash-durability guarantee.

For job persistence, embedded SurrealDB was chosen over SQLite specifically because the user wanted to use/learn SurrealDB, and an embedded engine (e.g. RocksDB-backed) satisfies the internet-free requirement just as well as SQLite would.

## Known Issues / Tech Debt

- Cross-device job history and multi-user support are explicitly out of scope until/unless this decision is revisited.
- `api.rs` still exists as a leftover of the pre-pivot design — see [[wiki/issues/api-rs-obsolescence]].

## Related

[[wiki/architecture/system-overview]], [[wiki/components/http-api]]
