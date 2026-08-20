# Worker

**Type**: component
**Summary**: `crates/worker/` — pulls `JobEnvelope` messages from NATS, dispatches to `edit_video`, `convert_document`, or `merge_pdfs` modules, publishes `StatusEvent` updates throughout the job lifecycle.
**Tags**: #component #worker #ffmpeg #pandoc #pdfcpu #nats #progress
**Sources**: [[crates/worker/src/main.rs]], [[crates/worker/src/consumer.rs]], [[crates/worker/src/job.rs]], [[crates/worker/src/edit_video.rs]], [[crates/worker/src/convert_document.rs]], [[crates/worker/src/merge_pdfs.rs]], [[crates/worker/src/error.rs]]
**Related**: [[wiki/components/job-types]], [[wiki/components/publisher]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/issues/missing-db-and-progress]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]], [[wiki/issues/pdfcpu-merge-refuses-overwrite]]
**Last Updated**: 2026-08-19

---

## Overview

The worker is the consumer side of the queue. Each instance creates the durable pull consumer named `workers` on the `JOBS` JetStream stream, then loops: fetch one message, deserialize as `JobEnvelope`, dispatch to the appropriate handler, publish status events, ack. Multiple workers share the same consumer name — NATS dynamically distributes jobs between them (→ [[wiki/concepts/jetstream-pull-consumer]]).

The Tauri app spawns one worker sidecar per CPU core. Each is passed a numeric `worker_id` via `argv[1]` (log prefixes only) and three env vars: `FFMPEG_BIN`, `PANDOC_BIN`, `TYPST_BIN` — resolved paths to the bundled binaries.

The crate is split into three source files by concern: `main.rs` is the thin entry point (connect, get stream, `ensure_consumer`, fetch loop); `consumer.rs` owns the durable-consumer lifecycle and the ack-protocol constants; `job.rs` owns processing a single message.

The crate's Cargo package name (and therefore its compiled binary name) is `swiss-kyle-worker`, not `worker` — renamed specifically so process-name matching elsewhere can't collide with anything else (→ [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]). The directory (`crates/worker/`) and module layout are unaffected; only the `[package] name` in `Cargo.toml` and everywhere that resolves the built binary by name changed.

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
2. **`Processing { percent }`** — streamed (EditVideo only; ConvertDocument has no intermediate state)
3. **`Done`** or **`Failed { reason }`** — after the subprocess exits

### edit_video.rs

Invokes ffmpeg with a re-encoded video stream and a copied audio stream:

```
ffmpeg -y -ss <start> -i <input> -t <duration> -map 0:v:0? -map 0:a:0? -c:v libx264 -preset veryfast -crf 18 -c:a copy [-vf crop=<w>:<h>:<x>:<y>] <output>
```

This used to be `-c copy` (stream-copy, no re-encode) for both streams. `-c copy` can only start the output on a keyframe, and some sources — phone recordings in particular — space keyframes far enough apart that a short cut can contain none at all; ffmpeg then silently wrote zero video frames while still copying audio fine, exiting 0 with an audio-only (or empty) file. Fixed by always re-encoding the video stream (frame-accurate regardless of keyframe placement) while leaving audio a cheap stream copy, since audio has no equivalent keyframe constraint. `-ss` before `-i` plus `-t` (not `-to`) is the standard fast-seek-then-decode-forward idiom: ffmpeg seeks to the nearest preceding keyframe, decodes forward to the exact requested start, then encodes exactly `-t` from there. Covered by an e2e regression test using a real phone-recorded clip that originally surfaced the bug (→ [[wiki/components/e2e-tests]]).

`-vf crop=...` is appended only when `job.crop` is `Some` — an untouched crop (the frontend never sends one unless the user actually adjusts it) means a plain trim, identical to pre-crop-feature behavior. `width`/`height` are rounded down to the nearest even number (`& !1`) before use: libx264/yuv420p requires even dimensions, and the frontend's drag-computed rect won't naturally land on one.

Reads ffmpeg stderr byte-by-byte (ffmpeg uses `\r` not `\n` for progress). Parses `time=HH:MM:SS.cc` to compute percent and sends it to an unbounded mpsc channel, which a separate tokio task drains and publishes as `StatusEvent`. stderr lines are also accumulated — on non-zero exit, the last 4 non-empty lines are included in the `Failed` reason via `error::process_error`.

Output path: `~/Documents/swiss-kyle/edit-video/<job.output>`.

### convert_document.rs

Converts between document formats (md/docx/html/pdf). PDF from office files (doc/docx/odt/rtf) goes through Word COM automation or LibreOffice; PDF from other inputs goes pandoc → typst; everything else is a direct pandoc call. On non-zero exit, stderr is passed to `error::process_error`.

Output path: `~/Documents/swiss-kyle/convert-document/<output_stem>.<ext>`.

### merge_pdfs.rs

Invokes pdfcpu directly (no progress streaming — merges are fast enough that `Received` → `Done` is the only visible transition):

```
pdfcpu merge --force <output> <inputs...>
```

`--force` was added because pdfcpu refuses to overwrite an existing file by default, which meant re-running a merge with an unchanged output title failed the job outright instead of replacing the file — inconsistent with `cut_video.rs`'s `-y` flag, which already overwrites silently. Chosen over a UI confirmation step for consistency with that existing precedent (→ [[wiki/issues/pdfcpu-merge-refuses-overwrite]]). Requires at least 2 inputs (checked both here and in the `submit_merge_pdfs_job` command). On non-zero exit, stderr is passed to `error::process_error`.

Output path: `~/Documents/swiss-kyle/merge-pdfs/<output_stem>.pdf`.

### error.rs

Shared error formatting for both handlers: takes the last 4 non-empty lines of stderr (avoids the full ffmpeg/pandoc banner) and formats them into a `Box<dyn std::error::Error>`.

## Decisions & Rationale

A separate tokio task drains the progress channel rather than publishing inline in the stderr-read loop. `publish_status` is async; the ffmpeg stderr loop runs in a blocking thread. The unbounded channel bridges the two.

Video is re-encoded (`-c:v libx264`) rather than stream-copied, trading some speed for a frame-accurate cut regardless of keyframe placement (see edit_video.rs above) — and, since the crop feature, this is also what makes `-vf crop` a free addition to the same pass rather than a second, separate re-encode. Audio stays a stream copy since it has no equivalent keyframe constraint. The frontend still auto-fills the output extension from the input, which now mainly keeps the container format sane rather than guarding a codec-compatibility requirement.

Ack timing uses short `ack_wait` plus progress heartbeats rather than one long `ack_wait`. A flat timeout forces a choice between "slow jobs get stolen" and "crashed jobs recover slowly"; heartbeats decouple the two. Numbers were chosen for this workload: ffmpeg cuts stay fast even with re-encoding (`-preset veryfast`, seconds not minutes), and only LibreOffice/Word conversions are slow, so 30s covers a worker-crash gap while heartbeats protect any longer job.

## Known Issues / Tech Debt

- No SurrealDB diagnostic-log writes yet — job lifecycle exists in NATS events only, and always will (job-status persistence was decided against; SurrealDB's surviving scope is a write-only diagnostic log, not yet implemented) (→ [[wiki/decisions/adr-003-embedded-surrealdb]], [[wiki/issues/missing-db-and-progress]]).
- Process error messages show raw stderr tail rather than user-friendly guidance (→ [[wiki/issues/user-friendly-process-errors]]).
- A job that fails cleanly (non-zero exit) is still acked, so it is not retried. Redelivery (`max_deliver`) only covers workers that _crash_ mid-job. Clean failures are terminal by design.

## Related

[[wiki/components/job-types]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/components/tauri-app]], [[wiki/components/e2e-tests]], [[wiki/issues/missing-db-and-progress]], [[wiki/issues/pdfcpu-merge-refuses-overwrite]]
