# Publisher

**Type**: component
**Summary**: Shared library struct (`src/lib.rs`) that connects to NATS JetStream and durably publishes `Job` messages — the one piece of publish logic reused by both the CLI and the HTTP API.
**Tags**: #component #nats #shared-lib
**Sources**: [[src/lib.rs]]
**Related**: [[wiki/components/job-types]], [[wiki/components/cli-publisher]], [[wiki/components/http-api]], [[wiki/concepts/jetstream-pull-consumer]]
**Last Updated**: 2026-06-22

---

## Overview

`Publisher` is the shared core that both `publisher.rs` (CLI) and `api.rs` (HTTP) call into — neither binary talks to NATS directly. This is the "shared lib, multiple thin frontends" pattern: business logic lives once in the lib crate, and each binary is just a different way of invoking it (CLI, HTTP, eventually Tauri in-process calls).

## Details

```rust
pub struct Publisher {
    jetstream: async_nats::jetstream::Context,
}

impl Publisher {
    pub async fn connect() -> Result<Self, async_nats::Error> { ... }
    pub async fn publish(&self, job: &Job) -> Result<(), async_nats::Error> { ... }
}
```

- `connect()` opens a connection to `nats://localhost:4222` and calls `get_or_create_stream` for a stream named `JOBS` with subject `jobs`. Idempotent — safe to call on every process startup.
- `publish()` serializes the `Job` to JSON and calls `jetstream.publish(...).await?.await?` — the double `await` waits for the broker's ack, so this returns only once JetStream has durably stored the message.

## Decisions & Rationale

The double-await-for-ack pattern is what gives the "jobs are not lost if a worker crashes" guarantee from the design — the publish call doesn't return until JetStream confirms persistence (→ [[wiki/decisions/adr-002-keep-nats-for-durability]]).

## Known Issues / Tech Debt

None currently — this is the most complete/stable piece of the codebase.

## Related

[[wiki/components/job-types]], [[wiki/components/worker]], [[wiki/dependencies/async-nats]]
