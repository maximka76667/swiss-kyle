# Worker

**Type**: component
**Summary**: `crates/worker/src/main.rs` — pulls `JobEnvelope` messages one at a time from the durable NATS consumer, runs ffmpeg, streams byte-level stderr progress to a tokio channel, and publishes `StatusEvent` updates to NATS throughout the job lifecycle.
**Tags**: #component #worker #ffmpeg #nats #progress
**Sources**: [[crates/worker/src/main.rs]]
**Related**: [[wiki/components/job-types]], [[wiki/components/publisher]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/issues/missing-db-and-progress]]
**Last Updated**: 2026-06-28

---

## Overview

The worker is the consumer side of the queue. Each instance creates a durable pull consumer named `workers` on the `JOBS` JetStream stream, then loops: fetch one message, deserialize as `JobEnvelope`, run the job, publish status events, ack. Multiple worker processes share the same consumer name — NATS dynamically distributes jobs between them with no explicit partitioning (→ [[wiki/concepts/jetstream-pull-consumer]]).

The Tauri app spawns one worker sidecar per CPU core, each given a numeric `worker_id` via `argv[1]` used only for log prefixes.

## Details

### Fetch loop

```rust
loop {
    let messages = consumer.fetch()
        .max_messages(1)
        .expires(Duration::from_secs(5))
        .messages().await?;
    if let Some(message) = messages.next().await {
        let envelope: JobEnvelope = match serde_json::from_slice(&message.payload) {
            Ok(e) => e,
            Err(_) => { message.ack().await?; continue; }
        };
        // ... process ...
        message.ack().await?;
    }
}
```

`expires(5s)` means each fetch blocks at most 5 seconds before returning empty, which prevents the loop from stalling indefinitely. Empty fetches are logged every 5 occurrences to avoid flooding stdout.

Deserialization errors ack-and-skip instead of panicking — a malformed message is discarded rather than requeued forever.

### Status event lifecycle

For each `CutVideo` job, the worker publishes four kinds of `StatusEvent` on `jobs.status`:

1. **`Received`** — immediately on dequeue, before any ffmpeg work
2. **`Processing { percent }`** — streamed from ffmpeg stderr via an unbounded mpsc channel; a dedicated tokio task drains the channel and publishes each update
3. **`Done`** or **`Failed { reason }`** — after ffmpeg exits

### ffmpeg progress parsing

```rust
fn parse_time_secs(line: &str) -> Option<f64> {
    let rest = &line[line.find("time=")? + "time=".len()..];
    let time_str = &rest[..rest.find(' ').unwrap_or(rest.len())];
    let mut parts = time_str.split(':');
    let hours: f64 = parts.next()?.parse().ok()?;
    let minutes: f64 = parts.next()?.parse().ok()?;
    let seconds: f64 = parts.next()?.parse().ok()?;
    Some(hours * 3600.0 + minutes * 60.0 + seconds)
}
```

ffmpeg writes progress to stderr using `\r` (not `\n`) to overwrite the same terminal line. The worker reads stderr byte-by-byte, accumulating into a `String` and flushing on `\r` or `\n`. Each flush attempts `parse_time_secs`; on success, `percent = (elapsed / duration).clamp(0.0, 1.0) * 100.0` is sent to the channel.

### Output path

Output is resolved to `~/Videos/swiss-kyle/<job.output>` via the `dirs` crate. The directory is created if absent.

### ffmpeg invocation

```
ffmpeg -y -i <input> -ss <start> -to <end> -c copy <output>
```

`-c copy` avoids re-encoding; `-y` overwrites without prompting.

## Decisions & Rationale

A separate tokio task drains the progress channel rather than publishing inline in the stderr-read loop. This is necessary because `publish_status` is async and the ffmpeg stderr reading loop runs in a `spawn_blocking` thread. The unbounded channel is the bridge.

## Known Issues / Tech Debt

- No SurrealDB writes — job lifecycle exists in NATS events only, not in queryable persistent state (→ [[wiki/issues/missing-db-and-progress]]).

## Related

[[wiki/components/job-types]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/components/tauri-app]], [[wiki/issues/missing-db-and-progress]]
