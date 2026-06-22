# JetStream Pull Consumer (Dynamic Load Balancing)

**Type**: concept
**Summary**: Multiple worker processes share one durable JetStream pull consumer name, so NATS dynamically hands each fetched message to whichever worker asks first — no round-robin or partition assignment needed.
**Tags**: #concept #nats #jetstream #load-balancing
**Sources**: [[docs/DESIGN.md]], [[src/bin/subscriber.rs]], [[src/lib.rs]]
**Related**: [[wiki/components/worker]], [[wiki/components/publisher]], [[wiki/decisions/adr-002-keep-nats-for-durability]]
**Last Updated**: 2026-06-22

---

## Overview

JetStream pull consumers let multiple independent processes "share" one logical consumer by all calling `fetch()` against the same durable consumer name (`"workers"` in this codebase). Whichever process calls `fetch()` first gets the next message — this is dynamic load balancing, distinct from a fixed round-robin assignment, and it's what lets `docs/DESIGN.md`'s "multiple workers can run in parallel (one per CPU core)" work without any extra coordination code.

## Details

```rust
let consumer = stream.get_or_create_consumer(
    "workers",
    async_nats::jetstream::consumer::pull::Config {
        durable_name: Some("workers".to_string()),
        ..Default::default()
    },
).await?;

let messages = consumer.fetch().max_messages(1).messages().await?;
```

Each worker process calls `get_or_create_consumer` with the same name and fetches one message at a time. The `durable_name` makes the consumer's position persist across worker restarts — if a worker process dies and restarts, it resumes from where the shared consumer left off rather than re-reading from the start of the stream.

## Decisions & Rationale

Fetching `max_messages(1)` rather than a batch keeps each worker holding at most one in-flight job — appropriate since `cut_video` runs ffmpeg synchronously/blockingly within the async task.

## Known Issues / Tech Debt

`message.ack().await?` only happens after `cut_video` returns (success or error) — a failed job is still acked rather than nacked, so JetStream will not redeliver it for retry. This means failures are currently terminal, not retried.

## Related

[[wiki/components/worker]], [[wiki/decisions/adr-002-keep-nats-for-durability]]
