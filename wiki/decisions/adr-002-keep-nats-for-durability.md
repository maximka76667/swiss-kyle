# ADR-002: Keep NATS JetStream for Durability

**Type**: decision
**Summary**: NATS+JetStream stays in the local-only architecture (instead of a simpler in-process channel) specifically because job durability across crashes is a hard requirement.
**Tags**: #decision #nats #durability
**Sources**: [[docs/DESIGN.md]]
**Related**: [[wiki/decisions/adr-001-local-only]], [[wiki/concepts/jetstream-pull-consumer]], [[wiki/components/publisher]], [[wiki/components/worker]]
**Last Updated**: 2026-06-22

---

## Overview

When evaluating whether to drop NATS in favor of a simpler in-process job queue (e.g. `tokio::sync::mpsc`) as part of the local-only pivot, durability was identified as a hard requirement that an in-memory channel cannot provide.

## Details

An in-process channel's queue lives only in that process's memory: if the app crashes mid-job, the queued job is gone with no retry. JetStream, by contrast, persists a published message to disk and only removes it once a consumer explicitly acks it — `Publisher::publish` doesn't return until that ack is confirmed (→ [[wiki/components/publisher]]). A worker that crashes mid-job leaves the message un-acked, so JetStream redelivers it.

This only matters because the worker is required to stay a separate sidecar process from the Tauri app (so it can keep running with the UI closed, per the system-tray requirement in `docs/DESIGN.md`) — an in-process channel can't cross that process boundary anyway, making it a non-option once that constraint is fixed.

## Decisions & Rationale

Decision: keep NATS+JetStream, run it locally instead of on a VPS. No code changes needed to `Publisher` or the worker's consumer logic — only the connection target changes (still `nats://localhost:4222`, just no longer requiring it to be reachable over the internet).

## Known Issues / Tech Debt

None — this is a settled decision, not an open gap.

## Related

[[wiki/decisions/adr-001-local-only]], [[wiki/concepts/jetstream-pull-consumer]]
