# async-nats

**Type**: dependency
**Summary**: Rust client for NATS/JetStream — used for all pub/sub and durable job-queue logic in this project.
**Tags**: #dependency #nats
**Sources**: [[Cargo.toml]], [[src/lib.rs]], [[src/bin/subscriber.rs]], [[src/bin/api.rs]]
**Related**: [[wiki/concepts/jetstream-pull-consumer]], [[wiki/components/publisher]], [[wiki/components/worker]]
**Last Updated**: 2026-06-22

---

## Overview

`async-nats = "0.49.1"` (per `Cargo.toml`). Provides both plain NATS pub/sub (`async_nats::connect`, `client.subscribe(...)`, used by `api.rs` for the `progress` subject) and the JetStream API (`async_nats::jetstream::new`, streams, pull consumers — used by `Publisher` and the worker).

## Details

Two usage patterns in this codebase:

- **Plain pub/sub** — `api.rs` subscribes to the `progress` subject directly on the `async_nats::Client`, no JetStream involved, no durability (fire-and-forget).
- **JetStream** — `Publisher` and the worker both call `jetstream.get_or_create_stream(...)` for the `JOBS` stream and durable pull consumers for the `workers` consumer — this is where durability and load balancing come from (→ [[wiki/concepts/jetstream-pull-consumer]]).

## Decisions & Rationale

Per `CLAUDE.md`, dependencies in this repo are added via `cargo add` rather than hand-editing `Cargo.toml`.

## Known Issues / Tech Debt

None identified.

## Related

[[wiki/components/publisher]], [[wiki/components/worker]], [[wiki/components/http-api]]
