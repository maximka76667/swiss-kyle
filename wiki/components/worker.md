# Worker

**Type**: component
**Summary**: `crates/worker/` — pulls `JobEnvelope` messages from NATS, dispatches to `cut_video` or `convert_document` modules, publishes `StatusEvent` updates throughout the job lifecycle.
**Tags**: #component #worker #ffmpeg #pandoc #nats #progress
**Sources**: [[crates/worker/src/main.rs]], [[crates/worker/src/consumer.rs]], [[crates/worker/src/job.rs]], [[crates/worker/src/cut_video.rs]], [[crates/worker/src/convert_document.rs]], [[crates/worker/src/error.rs]]
**Related**: [[wiki/components/job-types]], [[wiki/components/publisher]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/issues/missing-db-and-progress]]
**Last Updated**: 2026-07-02

---

## Overview

The worker is the consumer side of the queue. Each instance creates the durable pull consumer named `workers` on the `JOBS` JetStream stream, then loops: fetch one message, deserialize as `JobEnvelope`, dispatch to the appropriate handler, publish status events, ack. Multiple workers share the same consumer name — NATS dynamically distributes jobs between them (→ [[wiki/concepts/jetstream-pull-consumer]]).

The Tauri app spawns one worker sidecar per CPU core. Each is passed a numeric `worker_id` via `argv[1]` (log prefixes only) and three env vars: `FFMPEG_BIN`, `PANDOC_BIN`, `TYPST_BIN` — resolved paths to the bundled binaries.

The crate is split into three source files by concern: `main.rs` is the thin entry point (connect, get stream, `ensure_consumer`, fetch loop); `consumer.rs` owns the durable-consumer lifecycle and the ack-protocol constants; `job.rs` owns processing a single message.

## Details

### main.rs — entry point

Parses `worker_id`, connects to `nats://localhost:4222`, gets or creates the `JOBS` stream, calls `consumer::ensure_consumer`, then loops calling `fetch().max_messages(1).expires(5s)` and hands each message to `job::handle_message`. Fetch errors sleep 1s and retry rather than exiting.

### consumer.rs — durable consumer + ack protocol

Three constants define the redelivery protocol:

- `ACK_WAIT = 30s` — how long JetStream waits for an ack before redelivering to another worker. Short so a crashed worker's job is picked up quickly.
- `HEARTBEAT_INTERVAL = 10s` — how often a running job sends a progress ack to reset the timer. Must stay below `ACK_WAIT`.
- `MAX_DELIVER = 3` — poison-pill guard; a job that repeatedly crashes workers is dropped after three deliveries.

`ensure_consumer` reconciles persisted config: JetStream stores a durable consumer's config, so an existing `workers` consumer created with older settings keeps them. The function reads `consumer_info`; if the stored `ack_wait` or `max_deliver` differs from desired, it deletes the consumer so it is recreated correctly. Because all workers race through this at startup, creation is wrapped in a retry loop (up to 10 attempts, 500 ms apart) instead of `?`-exiting on a transient failure.

### job.rs — processing one message

`handle_message` deserializes the payload; a malformed message is acked (not redelivered forever) after publishing a `Failed` status. On success it publishes `Received`, runs the job, then publishes `Done`/`Failed` and acks. A `Bins` struct holds the three binary paths, leaked once at startup (`Box::leak`) so the blocking job closure can capture a `&'static` reference instead of cloning per job. A small `emit` helper collapses the repeated "build a `StatusEvent`, publish it" pattern.

`run_job` runs the blocking job off the async runtime via `spawn_blocking` (the handlers block on child processes). While it runs, a `tokio::select!` loop sends `AckKind::Progress` every `HEARTBEAT_INTERVAL`: each progress ack resets `ACK_WAIT`, so a legitimately slow job is never redelivered, while a crashed worker's job frees up after 30s. `Box<dyn Error>` is not `Send`, so the handler result is mapped to `String` to cross the thread boundary.

### Status event lifecycle

For every job:

1. **`Received`** — immediately on dequeue
2. **`Processing { percent }`** — streamed (CutVideo only; ConvertDocument has no intermediate state)
3. **`Done`** or **`Failed { reason }`** — after the subprocess exits

### cut_video.rs

Invokes ffmpeg with stream-copy (no re-encode):

```
ffmpeg -y -i <input> -ss <start> -to <end> -c copy <output>
```

Reads ffmpeg stderr byte-by-byte (ffmpeg uses `\r` not `\n` for progress). Parses `time=HH:MM:SS.cc` to compute percent and sends it to an unbounded mpsc channel, which a separate tokio task drains and publishes as `StatusEvent`. stderr lines are also accumulated — on non-zero exit, the last 4 non-empty lines are included in the `Failed` reason via `error::process_error`.

Output path: `~/Documents/swiss-kyle/cut-video/<job.output>`.

### convert_document.rs

Converts between document formats (md/docx/html/pdf). PDF from office files (doc/docx/odt/rtf) goes through Word COM automation or LibreOffice; PDF from other inputs goes pandoc → typst; everything else is a direct pandoc call. On non-zero exit, stderr is passed to `error::process_error`.

Output path: `~/Documents/swiss-kyle/convert-document/<output_stem>.<ext>`.

### error.rs

Shared error formatting for both handlers: takes the last 4 non-empty lines of stderr (avoids the full ffmpeg/pandoc banner) and formats them into a `Box<dyn std::error::Error>`.

## Decisions & Rationale

A separate tokio task drains the progress channel rather than publishing inline in the stderr-read loop. `publish_status` is async; the ffmpeg stderr loop runs in a blocking thread. The unbounded channel bridges the two.

`-c copy` avoids re-encoding for speed. This means the output container must support the input codec — e.g. a VP8 webm cannot be stream-copied into an mp4. The frontend auto-fills the output extension from the input to prevent this mismatch.

Ack timing uses short `ack_wait` plus progress heartbeats rather than one long `ack_wait`. A flat timeout forces a choice between "slow jobs get stolen" and "crashed jobs recover slowly"; heartbeats decouple the two. Numbers were chosen for this workload: ffmpeg cuts are `-c copy` (seconds), and only LibreOffice/Word conversions are slow, so 30s covers a worker-crash gap while heartbeats protect any longer job.

## Known Issues / Tech Debt

- No SurrealDB writes — job lifecycle exists in NATS events only (→ [[wiki/issues/missing-db-and-progress]]).
- Process error messages show raw stderr tail rather than user-friendly guidance (→ [[wiki/issues/user-friendly-process-errors]]).
- A job that fails cleanly (non-zero exit) is still acked, so it is not retried. Redelivery (`max_deliver`) only covers workers that *crash* mid-job. Clean failures are terminal by design.

## Related

[[wiki/components/job-types]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/components/tauri-app]], [[wiki/issues/missing-db-and-progress]]
