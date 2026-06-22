# Worker

**Type**: component
**Summary**: `subscriber.rs` binary — pulls one job at a time from the durable NATS consumer and runs ffmpeg as a subprocess; logs status transitions but doesn't yet persist them or report progress.
**Tags**: #component #worker #ffmpeg #nats
**Sources**: [[src/bin/subscriber.rs]]
**Related**: [[wiki/components/job-types]], [[wiki/components/publisher]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/issues/missing-db-and-progress]]
**Last Updated**: 2026-06-22

---

## Overview

The worker is the consumer side of the queue. Each instance creates a durable pull consumer named `workers` on the `JOBS` stream, then loops: fetch one message, deserialize it as a `Job`, run it, ack. Multiple worker processes can run against the same consumer name and NATS will dynamically load-balance jobs between them — no explicit partitioning logic needed (→ [[wiki/concepts/jetstream-pull-consumer]]).

Takes an optional numeric `worker_id` as `argv[1]`, used only for log line prefixes.

## Details

```rust
let consumer = stream.get_or_create_consumer(
    "workers",
    async_nats::jetstream::consumer::pull::Config {
        durable_name: Some("workers".to_string()),
        ..Default::default()
    },
).await?;

loop {
    let messages = consumer.fetch().max_messages(1).messages().await?;
    if let Some(message) = messages.next().await {
        let job: Job = serde_json::from_slice(&message.payload).unwrap();
        match job {
            Job::CutVideo(j) => {
                println!("Worker {} processing job", worker_id);
                match cut_video(j) {
                    Ok(()) => println!("Worker {} done", worker_id),
                    Err(e) => eprintln!("Worker {} failed: {}", worker_id, e),
                }
            }
        }
        message.ack().await?;
    }
}
```

`cut_video` shells out to `ffmpeg -y -i <input> -ss <start> -to <end> -c copy <output>` via `std::process::Command`, and returns `Err` if ffmpeg exits non-zero.

A previous version had a hardcoded `std::thread::sleep(Duration::from_secs(10))` before every ffmpeg run — debug scaffolding, since removed.

## Decisions & Rationale

Status is currently just `println!`/`eprintln!` — no DB write, no NATS progress publish. This was an explicit scope decision for backend v1: ship a working end-to-end pipeline first, defer persistence and percentage-progress until later (→ [[wiki/issues/missing-db-and-progress]]).

## Known Issues / Tech Debt

- No ffmpeg stderr `time=` parsing → no percentage progress, despite `docs/DESIGN.md` specifying it.
- No publish to the NATS `progress` subject, so `api.rs`'s websocket has nothing to forward.
- No SurrealDB writes — job lifecycle (`pending`/`processing`/`done`/`failed`) only exists as console output, not as queryable state.
- `message.payload` deserialization uses `.unwrap()` — a malformed message would panic the worker rather than nack/skip it.

## Related

[[wiki/components/publisher]], [[wiki/components/job-types]], [[wiki/issues/missing-db-and-progress]]
