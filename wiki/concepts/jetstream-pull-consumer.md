# JetStream Pull Consumer (Dynamic Load Balancing)

**Type**: concept
**Summary**: Multiple worker processes share one durable JetStream pull consumer name, so NATS dynamically hands each fetched message to whichever worker asks first — no round-robin or partition assignment needed.
**Tags**: #concept #nats #jetstream #load-balancing
**Sources**: [[docs/DESIGN.md]], [[crates/worker/src/consumer.rs]], [[crates/worker/src/job.rs]]
**Related**: [[wiki/components/worker]], [[wiki/components/publisher]], [[wiki/decisions/adr-002-keep-nats-for-durability]]
**Last Updated**: 2026-07-02

---

## Overview

JetStream pull consumers let multiple independent processes "share" one logical consumer by all calling `fetch()` against the same durable consumer name (`"workers"` in this codebase). Whichever process calls `fetch()` first gets the next message — this is dynamic load balancing, distinct from a fixed round-robin assignment, and it's what lets `docs/DESIGN.md`'s "multiple workers can run in parallel (one per CPU core)" work without any extra coordination code.

## Details

```rust
let consumer = stream.get_or_create_consumer(
    "workers",
    async_nats::jetstream::consumer::pull::Config {
        durable_name: Some("workers".to_string()),
        ack_wait: ACK_WAIT,
        max_deliver: MAX_DELIVER,
        ..Default::default()
    },
).await?;

let messages = consumer.fetch().max_messages(1).messages().await?;
```

Each worker process calls `get_or_create_consumer` with the same name and fetches one message at a time. The `durable_name` makes the consumer's position persist across worker restarts — if a worker process dies and restarts, it resumes from where the shared consumer left off rather than re-reading from the start of the stream.

### Persisted config and reconciliation

JetStream stores a durable consumer's config server-side, so `get_or_create_consumer` returns the *existing* consumer unchanged even if the requested config differs. `consumer.rs`'s `ensure_consumer` handles this by reading `consumer_info` and deleting the consumer when the stored `ack_wait`/`max_deliver` don't match, so it gets recreated with current settings. All workers race through this at startup, so creation is retried rather than fatal (→ [[wiki/components/worker]]).

### Redelivery: ack_wait + progress heartbeats

A message is redelivered if it isn't acked within `ack_wait` (30s). Rather than picking a long `ack_wait` to protect slow jobs, the worker keeps `ack_wait` short and sends `AckKind::Progress` every 10s while a job runs — each progress ack resets the timer. So a crashed worker's job frees up within 30s, while a legitimately long job is never stolen. `max_deliver: 3` caps redeliveries of a job that repeatedly crashes workers.

## Decisions & Rationale

Fetching `max_messages(1)` rather than a batch keeps each worker holding at most one in-flight job. The job itself runs in `spawn_blocking` (the ffmpeg/pandoc handlers block), and the async task drives progress heartbeats while it runs.

## Known Issues / Tech Debt

A job that fails cleanly (handler returns an error) is acked after publishing `Failed`, so it is not retried — redelivery only covers workers that *crash* mid-job. Clean failures are terminal by design.

## Related

[[wiki/components/worker]], [[wiki/decisions/adr-002-keep-nats-for-durability]]
