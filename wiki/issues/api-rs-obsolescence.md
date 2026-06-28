# api.rs Replaced by Tauri App (Resolved)

**Type**: issue
**Summary**: The standalone HTTP API binary (`api.rs`) has been superseded — the Tauri app now handles job submission and status forwarding in-process. This issue is resolved.
**Tags**: #issue #tech-debt #tauri #resolved
**Sources**: [[src-tauri/src/lib.rs]], [[docs/DESIGN.md]]
**Related**: [[wiki/components/http-api]], [[wiki/components/tauri-app]], [[wiki/decisions/adr-001-local-only]]
**Last Updated**: 2026-06-28

---

## Overview

This issue tracked `api.rs` as temporary scaffolding pending a real Tauri app. The Tauri app now exists (`src-tauri/src/lib.rs`) and implements the same responsibilities in-process: `submit_cut_job` publishes to NATS JetStream, and a background task subscribes to `jobs.status` and re-emits events as Tauri events to the frontend — no HTTP or websocket needed. `api.rs` is no longer in the active codebase.

## Decisions & Rationale

Resolved as designed: the `shared` crate's `Publisher` is called directly from Tauri command handlers, and NATS status events flow via `app_handle.emit()` rather than a websocket (→ [[wiki/components/tauri-app]]).

## Related

[[wiki/components/http-api]], [[wiki/components/tauri-app]], [[wiki/decisions/adr-001-local-only]]
