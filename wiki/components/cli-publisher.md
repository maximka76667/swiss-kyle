# CLI Publisher

**Type**: component
**Summary**: `publisher.rs` binary — a thin CLI wrapper over `Publisher::publish`, used for manually submitting jobs during development before the Tauri app exists.
**Tags**: #component #cli
**Sources**: [[src/bin/publisher.rs]]
**Related**: [[wiki/components/publisher]], [[wiki/components/http-api]]
**Last Updated**: 2026-06-22

---

## Overview

Usage: `publisher cut <input> <output> <start_secs> <end_secs>`. Positional-args only, no flag parsing (e.g. no `-o`/`--output`). Inputs/outputs are resolved relative to a `videos/` directory by hardcoded `format!("videos/{}", ...)`.

## Details

```rust
let job = match args[1].as_str() {
    "cut" => Job::CutVideo(CutVideo {
        input: format!("videos/{}", args[2]),
        output: format!("videos/{}", args[3]),
        start_secs: args[4].parse().expect("start_secs must be a number"),
        end_secs: args[5].parse().expect("end_secs must be a number"),
    }),
    cmd => { eprintln!("Unknown command: {}", cmd); return Ok(()); }
};

let publisher = Publisher::connect().await?;
publisher.publish(&job).await?;
```

Only publishes the job — does not spawn or manage worker processes; a separate `subscriber` process must already be running against the same NATS instance for the job to actually get processed (→ [[wiki/components/worker]]).

## Decisions & Rationale

Considered switching to `clap`-based flag parsing (e.g. `-o`, `-s`, `-e`) for nicer ergonomics; deferred until after backend v1 is working end-to-end.

## Known Issues / Tech Debt

- No flag-based syntax, only strict positional args.
- Requires `nats-server` running locally and reachable at `nats://localhost:4222` — nothing in the repo starts it automatically yet.

## Related

[[wiki/components/publisher]], [[wiki/components/worker]]
