# HTTP API

**Type**: component
**Summary**: `api.rs` binary — Axum HTTP service exposing job submission and a progress websocket; built for the original VPS-backend design and slated for replacement by the Tauri app.
**Tags**: #component #axum #http #obsolescence
**Sources**: [[src/bin/api.rs]]
**Related**: [[wiki/components/publisher]], [[wiki/decisions/adr-001-local-only]], [[wiki/issues/api-rs-obsolescence]]
**Last Updated**: 2026-06-22

---

## Overview

Exposes two routes:

- `POST /jobs/cut` — deserializes a `CutVideo` from the JSON body, calls `Publisher::publish`, returns 202 or 500.
- `GET /ws/progress` — upgrades to a websocket and forwards every message from the plain NATS subject `progress` to the client as text.

## Details

```rust
async fn submit_cut_job(State(state): State<AppState>, Json(job): Json<CutVideo>) -> impl IntoResponse {
    match state.publisher.publish(&Job::CutVideo(job)).await {
        Ok(_) => StatusCode::ACCEPTED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn handle_progress_socket(mut socket: WebSocket, state: AppState) {
    let Ok(mut subscriber) = state.nats.subscribe("progress").await else { return; };
    while let Some(message) = subscriber.next().await {
        let text = String::from_utf8_lossy(&message.payload).into_owned();
        if socket.send(Message::Text(text.into())).await.is_err() { break; }
    }
}
```

Listens on `0.0.0.0:3000`.

## Decisions & Rationale

Under the original design, this was the backend the Tauri frontend would call over HTTP from a remote-server architecture. After the local-only pivot (→ [[wiki/decisions/adr-001-local-only]]), the Tauri app calls publish logic in-process instead, and progress goes through Tauri events rather than a websocket. `api.rs` is being kept temporarily as a manual test harness for backend v1 (`curl`-able) since the Tauri app doesn't exist yet.

## Known Issues / Tech Debt

- Duplicates responsibility the Tauri app will eventually take over in-process — see [[wiki/issues/api-rs-obsolescence]].
- The websocket has nothing to forward currently: nothing publishes to the `progress` subject (the worker doesn't yet — see [[wiki/issues/missing-db-and-progress]]).
- No SurrealDB write for the initial `pending` job record, despite `docs/DESIGN.md` specifying the API/Tauri layer should write it.

## Related

[[wiki/components/publisher]], [[wiki/components/worker]]
