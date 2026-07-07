# Rebuilding the Worker Alone Doesn't Refresh What the App Actually Spawns

**Type**: issue
**Summary**: Resolved. `prepare-sidecars.ts` rebuilding `worker` and copying it to `src-tauri/binaries/worker-<triple>.exe` has no effect on the running app until `app.exe` itself is rebuilt — Tauri's resource-copy step (staging `binaries/*` into the resource dir the app actually spawns from) only runs as part of the `app` crate's own build script.
**Tags**: #issue #resolved #e2e #testing #tauri #build
**Sources**: [[e2e/package.json]], [[prepare-sidecars.ts]], [[src-tauri/src/lib.rs]]
**Related**: [[wiki/components/e2e-tests]], [[wiki/components/tauri-app]]
**Last Updated**: 2026-07-07

---

## Overview

While adding an e2e test for real job processing (submit a cut-video job, wait for "Done"), a change to `crates/shared/src/lib.rs`'s `base_output_dir()` appeared to have no effect: output kept landing in the real `~/Documents/swiss-kyle/` instead of the redirected test folder, even after rebuilding the `worker` crate.

## Details

Diagnosed by isolating the override logic in a throwaway `cargo test -p shared` — it computed the correct redirected path. So the bug wasn't in the logic; it was that the *running* worker process wasn't the one just rebuilt.

`worker` binaries are deployed through two separate steps:
1. `prepare-sidecars.ts` (invoked by Tauri's `beforeDevCommand`/`beforeBuildCommand`, → [[wiki/components/tauri-app]]) runs `cargo build -p worker` and copies the result to `src-tauri/binaries/worker-<triple>.exe`.
2. Tauri's own build script (part of the `app` crate's `cargo build`, since `binaries/*` is declared under `bundle.resources` in `tauri.conf.json`) copies *that* file into the actual resource directory the running app resolves and spawns from (`target/debug/bin/` for dev builds).

Step 2 only runs when `app` itself gets rebuilt. Running `bun prepare-sidecars.ts` alone updates step 1's output but leaves step 2's copy (what's actually executed) untouched. Confirmed by comparing timestamps: `target/debug/bin/worker-x86_64-pc-windows-msvc.exe` was days old while `src-tauri/binaries/worker-x86_64-pc-windows-msvc.exe` had just been rebuilt.

## Decisions & Rationale

Fixed by making the e2e test script fully self-sufficient and correctly ordered: `e2e/package.json`'s `test` script now runs `bun ../prepare-sidecars.ts && cargo build --manifest-path ../src-tauri/Cargo.toml && wdio run ./wdio.conf.ts` — rebuild worker, *then* rebuild the app (which performs the resource copy), *then* run tests. This guarantees the suite always exercises current code regardless of what a contributor last touched, without requiring them to remember a separate manual build step.

## Known Issues / Tech Debt

None remaining — verified by rebuilding both in the correct order and confirming test output lands in the redirected `.development/` folder, not the real Documents folder.

## Related

[[wiki/components/e2e-tests]], [[wiki/components/tauri-app]]
