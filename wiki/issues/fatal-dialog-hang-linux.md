# fatal()'s Error Dialog Hung Silently on Linux

**Type**: issue
**Summary**: Resolved. `fatal()`'s blocking error dialog never rendered on Linux — the app just hung with no error shown, whenever startup failed (e.g. the `resolve_bin` bug in [[wiki/issues/sidecar-path-resolution-usr-bin-collision]]). Fixed by switching `tauri_plugin_dialog` from its default `gtk` backend to `xdg-portal`.
**Tags**: #issue #resolved #linux #tauri #gtk
**Sources**: [[src-tauri/src/lib.rs]], [[src-tauri/Cargo.toml]]
**Related**: [[wiki/components/tauri-app]], [[wiki/issues/sidecar-path-resolution-usr-bin-collision]]
**Last Updated**: 2026-07-03

---

## Overview

`fatal()` (`src-tauri/src/lib.rs`) is meant to show a blocking native error dialog and exit whenever startup fails. On Linux it did neither — it just hung indefinitely, which is what made the [[wiki/issues/sidecar-path-resolution-usr-bin-collision]] bug so hard to diagnose: no error, just a frozen window.

## Details

`tauri_plugin_dialog`'s default Linux backend (`gtk` feature, wrapping the `rfd` crate's GTK3 implementation) calls into GTK's `MainContext` to display the dialog. `fatal()` is called from inside `setup()`, which runs *before* Tauri's own event loop (`.run()`) has started — there's no active, iterating GTK main loop yet for the dialog to render into, so the call hangs forever.

This is also a known upstream bug independent of the timing issue: [tauri-apps/plugins-workspace#956](https://github.com/tauri-apps/plugins-workspace/issues/956) ("Any blocking dialog does not display properly when running on Linux"), fixed for later plugin versions by PR #1033, but the `setup()`-timing issue would still cause the same symptom regardless of plugin version.

Confirmed via direct testing (forced `resolve_bin` to fail on purpose, repeatable without a full rebuild):
- Switching to `rfd` directly (bypassing the Tauri plugin) *also* hung — same underlying cause, not specific to the plugin.
- `zenity --error --text="test"` run directly from a terminal worked fine — proved the machine's GTK stack itself wasn't broken, just this specific in-process-before-the-loop-starts scenario.

## Decisions & Rationale

Fix: switched `tauri-plugin-dialog` from `default-features = true` (implying `gtk`) to `default-features = false, features = ["xdg-portal"]`. This asks a system DBus service (the XDG Desktop Portal) to show the dialog instead of driving GTK directly in-process — it doesn't depend on this app's own event loop at all, which is exactly why `zenity` (its own separate process, own fresh loop) worked while in-process GTK calls didn't. Confirmed the fix works by re-running the forced-failure test: the dialog now actually appears.

Confirmed this is Linux-only and doesn't affect Windows/macOS: `tauri-plugin-dialog`'s `Cargo.toml` shows `default = ["gtk3"]` only ever selected `rfd`'s `gtk3` backend, which is itself target-gated to Linux/BSD in `rfd`'s own `Cargo.toml` — Windows/macOS backends are pulled in unconditionally via `[target.'cfg(target_os = "windows"/"macos")'.dependencies]`, never controlled by this feature flag at all. The underlying bug is Linux-specific too: Win32 `MessageBox` and macOS `NSAlert` don't have GTK's GLib-`MainContext` dependency.

An alternative considered and rejected: shelling out to `zenity`/`osascript`/PowerShell directly per-platform for just the fatal-error case. Rejected as a workaround that would add more external process dependencies for something that should be a built-in capability — `xdg-portal` is the actual Tauri-supported mechanism for this, not a hack.

Requires `zenity` (or another XDG Desktop Portal backend implementation) to be present on the user's system — a reasonable assumption for a normal desktop Linux install, and confirmed present on this dev machine.

## Known Issues / Tech Debt

None remaining — verified fixed via direct reproduction and re-test.

## Related

[[wiki/components/tauri-app]], [[wiki/issues/sidecar-path-resolution-usr-bin-collision]]
