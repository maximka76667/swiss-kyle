# ADR-004: Bundled Tools as Private `resources`, Not `externalBin`

**Type**: decision
**Summary**: Moved all six bundled tools (nats-server, worker, ffmpeg, pandoc, typst, pdfcpu) from Tauri's `externalBin`/sidecar mechanism to `bundle.resources`, so packaged builds place them in a private per-app directory instead of the shared `/usr/bin` on Linux.
**Tags**: #decision #packaging #linux #tauri
**Sources**: [[src-tauri/tauri.conf.json]], [[src-tauri/src/lib.rs]]
**Related**: [[wiki/components/tauri-app]], [[wiki/issues/sidecar-path-resolution-usr-bin-collision]], [[wiki/issues/prepare-sidecars-pkill-broad-match]]
**Last Updated**: 2026-07-03

---

## Overview

Testing a real packaged `.deb`/AppImage build (not `bun tauri dev`) surfaced two bugs at once, both traced back to the same root cause: Tauri's `externalBin`/sidecar mechanism resolves and places binaries *next to the main executable*. For a `.deb` install, that's `/usr/bin` — a shared system directory.

## Details

Two symptoms, one cause:

1. **Packaged builds silently hung on startup.** The app's own `resolve_bin()` was looking for `ffmpeg`/`pandoc`/`typst`/`pdfcpu` under `resource_dir()`, a *different* directory than where `externalBin` actually places them. `resolve_bin` always failed in any packaged build, triggering `fatal()` — but `fatal()`'s dialog didn't render either (→ [[wiki/issues/fatal-dialog-hang-linux]]), so the failure was invisible: just a frozen window.
2. **`dpkg -i` refused to install**, first with "trying to overwrite `/usr/bin/ffmpeg`" (a real `apt`-installed `ffmpeg` package existed), and after that was fixed, the same for `/usr/bin/nats-server` (this machine also had a real `nats-server` apt package — don't assume any bundled tool name is "safe" from collision).

## Decisions & Rationale

Fix: declare all six tools under `bundle.resources` (glob maps like `"binaries/ffmpeg-*": "bin/"`) instead of `bundle.externalBin`, and set `"mainBinaryName": "swiss-kyle"` (previously defaulting to the Cargo package name `app`). Tauri's `resource_dir()` resolves to a private, per-app directory — `/usr/lib/swiss-kyle/bin/` on a `.deb` install, confirmed via Tauri's own source (`tauri-2.11.3/src/path/desktop.rs`, `tauri-utils-2.9.3/src/platform.rs`) — separate from wherever the main binary lives, and this works the same way in dev builds too (Tauri's `resources` copying runs on every `cargo build`, not just full bundling), with no per-platform config files needed: only one platform's triple-suffixed binaries ever exist in `src-tauri/binaries/` on a given build machine, so one shared glob map handles every platform.

Alternatives considered:

- **Shell out to a system dialog tool for errors, or accept the `/usr/bin` collision as "unlikely"** — rejected; explicitly not wanted. The point of bundling tools is that the app never depends on or interferes with what the user already has installed.
- **Rename the bundled binaries to unique, app-prefixed names** (e.g. `swiss-kyle-ffmpeg`) and keep `externalBin` — considered as a lighter alternative, rejected in favor of the private-directory fix since it's the architecturally correct pattern (matches how real Debian packages like Firefox/Chromium structure their own private binaries under `/usr/lib/<name>/`, with only a thin launcher in `/usr/bin`), not just a naming workaround.
- **Per-platform `tauri.<os>.conf.json` override files** — considered for handling the different target triples per platform, turned out to be unnecessary once confirmed that only one triple's files ever exist locally on any given build machine.

`nats-server`/`worker` (which need real process spawning with an event stream, not just a path string) switched from `app.shell().sidecar(name)` to `app.shell().command(resolved_path)`, using the same `resolve_bin()`. This needed no `capabilities/default.json` permission changes — confirmed empirically that Tauri's capability system only gates frontend-initiated (webview → Rust) calls, not calls made directly from the app's own Rust code.

This is a known gap in Tauri itself, not something specific to this app: see [tauri-apps/tauri#7074](https://github.com/tauri-apps/tauri/issues/7074) ("Debian packages are not compliant and dangerous"), where the Tauri team's own suggested fix is exactly this pattern.

## Known Issues / Tech Debt

- Only tested on Linux (`.deb`/AppImage, same-machine build). Windows/macOS use the same `resource_dir()`-based code path and should behave equivalently (private directory next to/inside the app bundle in both cases), but haven't been verified with a real packaged build on those platforms yet.
- `bun tauri build`'s AppImage/`.deb`/`.rpm` bundler still requires a system-installed `rpm`/`fakeroot`-adjacent toolchain quirk that isn't relevant here, but is worth knowing `rpm` was dropped from `bundle.targets` entirely (Fedora/RHEL packaging needs `rpmbuild`, not available on this Debian-based dev machine, and untested — can be added back later with a proper Fedora-based build environment).

## Related

[[wiki/components/tauri-app]], [[wiki/issues/sidecar-path-resolution-usr-bin-collision]], [[wiki/issues/prepare-sidecars-pkill-broad-match]], [[wiki/issues/fatal-dialog-hang-linux]]
