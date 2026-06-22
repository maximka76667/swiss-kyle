# api.rs Slated for Replacement by Tauri

**Type**: issue
**Summary**: The standalone HTTP API binary was built for the original VPS-backend design; under the local-only pivot its job-submission and progress-forwarding responsibilities move in-process into the Tauri app, but it's being kept temporarily as a manual test harness.
**Tags**: #issue #tech-debt #tauri
**Sources**: [[src/bin/api.rs]], [[docs/DESIGN.md]]
**Related**: [[wiki/components/http-api]], [[wiki/decisions/adr-001-local-only]]
**Last Updated**: 2026-06-22

---

## Overview

Before the local-only pivot, `api.rs` was the backend's HTTP entry point: the Tauri frontend would `POST /jobs/cut` and listen on `/ws/progress`. After the pivot, the Tauri app is meant to call `Publisher::publish` (and future DB writes) directly in-process, and forward NATS progress/completion events via Tauri events instead of a websocket — making `api.rs` redundant.

## Details

Kept for now as a `curl`-able way to exercise job submission and the progress-forwarding path while building out the worker/DB pieces, since the Tauri app doesn't exist yet. No code changes have been made to `api.rs` reflecting the pivot (it still expects a remote-style HTTP/websocket client).

## Decisions & Rationale

Explicitly scoped as temporary scaffolding, not a permanent component — avoid investing further feature work into it (e.g. it should not be the one to gain SurrealDB writes; that logic belongs in the shared `db` crate/lib, callable from whichever frontend needs it).

## Known Issues / Tech Debt

Should be deleted once the Tauri app exists and exercises the same in-process call path directly.

## Related

[[wiki/components/http-api]], [[wiki/decisions/adr-001-local-only]]
