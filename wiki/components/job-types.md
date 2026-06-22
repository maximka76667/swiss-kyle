# Job Types

**Type**: component
**Summary**: The `Job`/`CutVideo` enum and struct define the message payload published to NATS and consumed by workers.
**Tags**: #component #job-model
**Sources**: [[src/lib.rs]]
**Related**: [[wiki/components/publisher]], [[wiki/components/worker]], [[wiki/architecture/system-overview]]
**Last Updated**: 2026-06-22

---

## Overview

`Job` is an enum of job variants, serialized to JSON for transport over NATS. The only variant implemented today is `CutVideo`, which cuts a clip from `start_secs` to `end_secs` out of an input file.

## Details

```rust
pub enum Job {
    CutVideo(CutVideo),
}

pub struct CutVideo {
    pub input: String,
    pub output: String,
    pub start_secs: f64,
    pub end_secs: f64,
}
```

Both derive `Serialize`/`Deserialize` (serde) — this is the wire format published to the `jobs` NATS subject and read back by the worker.

`docs/DESIGN.md` lists future variants (`DownloadVideo`, `Transcode`, `ExtractAudio`) that don't exist in code yet.

## Decisions & Rationale

No file paths or job results are stored centrally — the design intentionally keeps the user's filesystem as the single source of truth for media files (→ [[wiki/decisions/adr-001-local-only]]).

## Known Issues / Tech Debt

Only `CutVideo` exists; the enum has a single variant so the `match` in the worker (→ [[wiki/components/worker]]) isn't yet exercised for branching logic.

## Related

[[wiki/components/publisher]], [[wiki/components/worker]]
