# HTTP API (Archived)

**Type**: component
**Summary**: `src/bin/api.rs` — Axum HTTP service built for the original VPS-backend design. Removed once the Tauri app took over job submission and status forwarding in-process.
**Tags**: #component #axum #http #archived
**Sources**: [[src/bin/api.rs]]
**Related**: [[wiki/decisions/adr-001-local-only]], [[wiki/issues/api-rs-obsolescence]]
**Last Updated**: 2026-06-28

---

## Overview

Exposed `POST /jobs/cut` and `GET /ws/progress`. Under the original remote design, the Tauri frontend called this over HTTP. After the local-only pivot (→ [[wiki/decisions/adr-001-local-only]]), the Tauri app called publish logic in-process instead and forwarded status as Tauri events rather than websocket messages. `api.rs` was removed as a consequence (→ [[wiki/issues/api-rs-obsolescence]]).

Kept here for historical reference only.
