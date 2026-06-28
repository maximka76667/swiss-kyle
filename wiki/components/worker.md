# Worker

**Type**: component
**Summary**: `crates/worker/` — pulls `JobEnvelope` messages from NATS, dispatches to `cut_video` or `convert_to_pdf` modules, publishes `StatusEvent` updates throughout the job lifecycle.
**Tags**: #component #worker #ffmpeg #pandoc #nats #progress
**Sources**: [[crates/worker/src/main.rs]], [[crates/worker/src/cut_video.rs]], [[crates/worker/src/convert_to_pdf.rs]], [[crates/worker/src/error.rs]]
**Related**: [[wiki/components/job-types]], [[wiki/components/publisher]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/issues/missing-db-and-progress]]
**Last Updated**: 2026-06-28

---

## Overview

The worker is the consumer side of the queue. Each instance creates a durable pull consumer named `workers` on the `JOBS` JetStream stream, then loops: fetch one message, deserialize as `JobEnvelope`, dispatch to the appropriate handler, publish status events, ack. Multiple workers share the same consumer name — NATS dynamically distributes jobs between them (→ [[wiki/concepts/jetstream-pull-consumer]]).

The Tauri app spawns one worker sidecar per CPU core. Each is passed a numeric `worker_id` via `argv[1]` (log prefixes only) and three env vars: `FFMPEG_BIN`, `PANDOC_BIN`, `TYPST_BIN` — resolved paths to the bundled binaries.

## Details

### Job dispatch

```rust
match envelope.job {
    Job::CutVideo(j)      => cut_video::run(j, &ffmpeg_bin, &progress_tx),
    Job::ConvertToPdf(j)  => convert_to_pdf::run(j, &pandoc_bin, &typst_bin),
}
```

### Status event lifecycle

For every job:

1. **`Received`** — immediately on dequeue
2. **`Processing { percent }`** — streamed (CutVideo only; ConvertToPdf has no intermediate state)
3. **`Done`** or **`Failed { reason }`** — after the subprocess exits

### cut_video.rs

Invokes ffmpeg with stream-copy (no re-encode):

```
ffmpeg -y -i <input> -ss <start> -to <end> -c copy <output>
```

Reads ffmpeg stderr byte-by-byte (ffmpeg uses `\r` not `\n` for progress). Parses `time=HH:MM:SS.cc` to compute percent and sends it to an unbounded mpsc channel, which a separate tokio task drains and publishes as `StatusEvent`. stderr lines are also accumulated — on non-zero exit, the last 4 non-empty lines are included in the `Failed` reason via `error::process_error`.

Output path: `~/Documents/swiss-kyle/cut-video/<job.output>`.

### convert_to_pdf.rs

Invokes pandoc with typst as the PDF engine:

```
pandoc <input> --output <output_path> --pdf-engine=<typst_bin>
```

Uses `Command::output()` (captures all at once — no streaming). On non-zero exit, stderr is passed to `error::process_error`.

Output path: `~/Documents/swiss-kyle/convert-to-pdf/<job.output>`.

### error.rs

Shared error formatting for both handlers:

```rust
pub fn process_error(name: &str, status: ExitStatus, stderr: &str) -> Box<dyn std::error::Error> {
    // takes the last 4 non-empty lines of stderr to avoid showing the full banner
    let tail = last_4_lines(stderr);
    format!("{} failed: {}", name, tail).into()
}
```

## Decisions & Rationale

A separate tokio task drains the progress channel rather than publishing inline in the stderr-read loop. `publish_status` is async; the ffmpeg stderr loop runs in a blocking thread. The unbounded channel bridges the two.

`-c copy` avoids re-encoding for speed. This means the output container must support the input codec — e.g. a VP8 webm cannot be stream-copied into an mp4. The frontend auto-fills the output extension from the input to prevent this mismatch.

## Known Issues / Tech Debt

- No SurrealDB writes — job lifecycle exists in NATS events only (→ [[wiki/issues/missing-db-and-progress]]).
- Process error messages show raw stderr tail rather than user-friendly guidance (→ [[wiki/issues/user-friendly-process-errors]]).

## Related

[[wiki/components/job-types]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/components/tauri-app]], [[wiki/issues/missing-db-and-progress]]
