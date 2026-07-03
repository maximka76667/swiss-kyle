# Packaged Builds Hung on Startup + .deb Installer Conflicts

**Type**: issue
**Summary**: Resolved. A real `.deb`/AppImage build (not `bun tauri dev`) would either fail to install (`dpkg -i` refused, "trying to overwrite `/usr/bin/ffmpeg`") or, once installed, hang on startup with an unresponsive window and no error shown.
**Tags**: #issue #resolved #linux #packaging
**Sources**: [[src-tauri/src/lib.rs]], [[src-tauri/tauri.conf.json]]
**Related**: [[wiki/decisions/adr-004-private-sidecar-resources]], [[wiki/components/tauri-app]], [[wiki/issues/fatal-dialog-hang-linux]]
**Last Updated**: 2026-07-03

---

## Overview

Two bugs, discovered together while testing a real packaged Linux build for the first time (everything up to this point had only been tested via `bun tauri dev`, which happened to mask both of them).

## Details

**Hang**: the old `resolve_bin()` checked `resource_dir().join(name)` to find `ffmpeg`/`pandoc`/`typst`/`pdfcpu`. But those four were declared as `externalBin` sidecars, which Tauri places *next to the main executable* (`/usr/bin/` for a `.deb`) — a different directory than `resource_dir()`. So `resolve_bin` always failed in any packaged build. It should have shown a clear "binary not found" error via `fatal()`, but that dialog itself hung with nothing shown (→ [[wiki/issues/fatal-dialog-hang-linux]]), so the actual observed symptom was just a frozen, unresponsive window — no error, no log output (release builds have `tauri_plugin_log` compiled out), nothing to go on except the process eventually getting OOM-killed or force-quit.

Ruled out before finding the real cause: OOM (machine had plenty of free RAM), WebKitGTK/GPU-driver crashes (a red herring carried over from unrelated GTK module warnings), and "built on the wrong CI runner" (ruled out by reproducing with a same-machine local build).

**Install conflict**: `.deb`'s `externalBin` sidecars land directly in `/usr/bin`, which is a shared system directory. `dpkg -i` refused to install because this machine already had real `ffmpeg` and `nats-server` apt packages occupying those exact paths — `dpkg` won't let one package silently overwrite files owned by another.

## Decisions & Rationale

See [[wiki/decisions/adr-004-private-sidecar-resources]] for the full fix (moving all six bundled tools to `bundle.resources` instead of `externalBin`, plus `mainBinaryName` rename). Both bugs shared the same root cause and were fixed by the same change.

## Known Issues / Tech Debt

None remaining for Linux — verified via a real `dpkg -i` install (no conflict) and launching the installed app (opens and works, confirmed with `ffmpeg`/`pandoc`/`typst`/`pdfcpu`/`nats-server`/`worker` all resolving correctly).

## Related

[[wiki/decisions/adr-004-private-sidecar-resources]], [[wiki/components/tauri-app]], [[wiki/issues/fatal-dialog-hang-linux]]
