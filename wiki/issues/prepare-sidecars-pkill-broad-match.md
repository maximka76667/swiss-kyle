# prepare-sidecars.ts's pkill Killed VS Code, Not Just Stale Sidecars

**Type**: issue
**Summary**: Resolved. `prepare-sidecars.ts` used `pkill -f worker` to clean up stale sidecar processes before rebuilding, which matched the substring "worker" in *any* process's full command line — including VS Code's own renderer processes on Linux — closing the editor window on every `bun tauri dev` run.
**Tags**: #issue #resolved #linux #dev-workflow
**Sources**: [[prepare-sidecars.ts]], [[src-tauri/src/lib.rs]]
**Related**: [[wiki/components/tauri-app]], [[wiki/decisions/adr-004-private-sidecar-resources]]
**Last Updated**: 2026-07-03

---

## Overview

On Linux (and macOS), running `bun tauri dev` would close the developer's entire VS Code window. It reproduced every time, only on Linux, and only from a machine where VS Code was already open.

## Details

Root cause: `prepare-sidecars.ts`'s `beforeDevCommand`/`beforeBuildCommand` step killed stale sidecar processes (left over from a crashed previous run, which would otherwise block rebuilding `worker` with `ETXTBSY`) using:

```ts
spawnSync("pkill", ["-f", "worker"], { stdio: "ignore" });
spawnSync("pkill", ["-f", "nats-server"], { stdio: "ignore" });
```

`pkill -f` matches the given string as a substring anywhere in a process's *full command line*, not just its name. Every VS Code helper process (renderer, utility, GPU, network service) carries the Electron/Chromium flag `--service-worker-schemes=vscode-webview` in its command line — which contains "worker". So every `bun tauri dev` run killed the developer's own VS Code renderer/helper processes as a side effect.

Windows was unaffected: its equivalent (`taskkill /IM worker.exe`) matches by exact image name, not substring, so it can't accidentally hit `Code.exe`.

A `git bisect` traced the regression to the commit that introduced `prepare-sidecars.ts` (replacing an equivalent, but never-actually-broken-this-way, shell script). An early grep for `pkill|killall|taskkill` had missed this file because it only searched `src-tauri/`, `scripts/`, and `package.json`, not the repo root.

## Decisions & Rationale

Fix: replaced name/pattern-based killing with verified PID tracking. `src-tauri/src/lib.rs` writes the PIDs of spawned sidecars to `.sidecar-pids` (under the private resource `bin/` directory, → [[wiki/decisions/adr-004-private-sidecar-resources]]) after spawning, and removes that file on a clean exit. `prepare-sidecars.ts` reads that same file before rebuilding, and only kills a PID if it's both still alive *and* verified (via `ps -p <pid> -o args=` on POSIX, `Get-Process`/`wmic` on Windows) to actually be running one of this app's own binaries — never a name/substring guess. The Rust side does the equivalent verification (via the `sysinfo` crate) on its own startup too, so a crashed release build now self-heals a stuck `nats-server` port instead of failing forever with "port 4222 already in use."

## Known Issues / Tech Debt

None remaining — verified fixed by testing `bun tauri dev` after the change with VS Code open; the window no longer closes.

## Related

[[wiki/components/tauri-app]], [[wiki/decisions/adr-004-private-sidecar-resources]]
