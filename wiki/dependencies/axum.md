# axum

**Type**: dependency
**Summary**: Web framework used by `api.rs` for HTTP job submission and the websocket progress endpoint.
**Tags**: #dependency #http #websocket
**Sources**: [[Cargo.toml]], [[src/bin/api.rs]]
**Related**: [[wiki/components/http-api]], [[wiki/issues/api-rs-obsolescence]]
**Last Updated**: 2026-06-22

---

## Overview

`axum = { version = "0.8.9", features = ["ws"] }` — the `ws` feature enables `WebSocketUpgrade`, used for `/ws/progress` in `api.rs`.

## Details

Two routes registered on a `Router` with shared `AppState` (NATS client + `Arc<Publisher>`):

- `POST /jobs/cut` — JSON body extraction via `Json<CutVideo>`.
- `GET /ws/progress` — `ws.on_upgrade(...)` into a loop forwarding NATS messages as websocket text frames.

## Decisions & Rationale

This dependency (and the whole `api.rs` binary) is expected to become unnecessary once the Tauri app exists and calls publish logic in-process — see [[wiki/issues/api-rs-obsolescence]].

## Known Issues / Tech Debt

Tied to a binary slated for removal/replacement; not worth investing further in the HTTP API surface itself.

## Related

[[wiki/components/http-api]], [[wiki/decisions/adr-001-local-only]]
