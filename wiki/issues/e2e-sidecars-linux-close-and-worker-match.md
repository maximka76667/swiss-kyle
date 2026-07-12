# E2E: sidecars.spec.ts's Close Test — Two Separate Linux Bugs, One Red Herring

**Type**: issue
**Summary**: Resolved. `sidecars.spec.ts`'s "kills sidecars when the window is closed normally" test failed reliably on Linux, for two unrelated reasons layered on top of each other: (1) the window-close IPC call can legitimately throw because the session dies before it can reply — not a crash, and expected on this platform; (2) `isProcessRunning("worker")` silently always returned `true` on Linux because it matched kernel `kworker/*` threads, masking whether the real sidecar had actually died.
**Tags**: #issue #resolved #e2e #linux #wry #flakiness #process-matching
**Sources**: [[e2e/specs/sidecars.spec.ts]], [[src-tauri/src/lib.rs]], [[crates/worker/Cargo.toml]], [[scripts/prepare-sidecars.ts]], [[src-tauri/tauri.conf.json]], [[src-tauri/capabilities/default.json]]
**Related**: [[wiki/components/e2e-tests]], [[wiki/issues/webview2-session-crash-on-fast-relaunch]], [[wiki/issues/prepare-sidecars-pkill-broad-match]], [[wiki/issues/e2e-linux-native-click-unreliable]]
**Last Updated**: 2026-07-10

---

## Overview

On Linux, `sidecars.spec.ts`'s close test failed consistently. The investigation took a wrong turn before landing on the real, much simpler causes — documented here because the dead end is as useful to know as the fix.

## Details

**First theory, wrong**: the failure looked superficially like [[wiki/issues/webview2-session-crash-on-fast-relaunch]] (a fresh session crashing shortly after launch, previously diagnosed on Windows/WebView2) — the app appeared to die a few seconds in, unprompted. A dedicated `navigation.spec.ts`-style loop of 8 fresh relaunches, each idling before its first WebDriver command, was built to catch it reliably. It still failed, but on the very *first* attempt, at zero delay — inconsistent with a rare, timing-sensitive race.

**Ruling it out empirically**: a keep-alive experiment settled it. A session was kept continuously active with `browser.getTitle()` pings every 500ms for 6 seconds, then the close command was sent — it still failed identically. A second version sent the close command *immediately*, zero delay, zero pings — same failure. Idle time was not the variable.

**Second theory, correct**: `browser.execute(() => invoke("plugin:window|close"))` asks the window to close — and on Linux, the window can close fast enough that the HTTP response for *that very call* never gets sent. The webview serving the WebDriver session is gone before it can reply, so the call throws (`"Session terminated without a reply"` → `"invalid session id"`), even though the close **succeeded**. Confirmed directly: process snapshots taken every 150-200ms during a live run showed the sidecars and app process exiting cleanly and in the correct order (sidecars killed first, matching the `RunEvent::Exit` handler in `lib.rs`, then the app process itself exits) — with no crash signal anywhere (`coredumpctl list` empty, no matching `dmesg`/kernel-log entry) — every single time. Windows/WebView2 apparently flushes the response before its own teardown completes, so it never hits this; nothing here should depend on that being guaranteed, though.

**The actual remaining bug, found after fixing the above**: with the close-call error correctly swallowed, the test still failed — now timing out after the full 15s poll instead of failing fast. Added temporary per-poll debug logging and found `nats-server` correctly reported dead within ~1s, but `worker` reported alive for the *entire* 15s window, every time. `isProcessRunning(pattern)` matches via `p.name.includes(pattern)` — and Linux kernel worker threads are named `kworker/...` and `*_kthread_worker/...`, both of which contain the substring `"worker"`. These threads always exist and never exit, so `isProcessRunning("worker")` was silently always `true` on Linux, completely independent of whether the actual `worker` sidecar process was alive.

This is the same *class* of bug as [[wiki/issues/prepare-sidecars-pkill-broad-match]] (which killed VS Code via `pkill -f worker` matching an unrelated process's command line) — a second, independent instance of "worker" being too generic a substring on Linux, this time in the e2e suite rather than the dev-run cleanup script.

## Decisions & Rationale

Two fixes, both needed:

1. `sidecars.spec.ts`'s close call now catches the expected error shape (`/session terminated without a reply|invalid session id|page crash or hang/i`) and treats it as success, then verifies the actual thing under test — that the sidecars are really gone — instead of failing on the call that triggers the close.
2. The worker binary/package was renamed from `worker` to `swiss-kyle-worker` (`crates/worker/Cargo.toml`'s package name, `scripts/prepare-sidecars.ts`'s build/copy commands, `tauri.conf.json`'s bundled-resources glob, `capabilities/default.json`'s `shell:allow-execute` permission entry, and the `resolve("worker")` call in `lib.rs`), so the e2e process-name match (`isProcessRunning("swiss-kyle-worker")`) can never collide with anything else again — chosen over just tightening the match string (e.g. `"worker-"`, which was already confirmed collision-free) because a distinctive, unambiguous binary name is a strictly stronger guarantee than a substring that merely happens not to collide with what's on this machine today.

An earlier attempt at (2) added an 8-iteration relaunch-stress loop to the test, based on the (by-then-disproven) relaunch-crash theory. It was reverted once the real causes were found — the failure was 100% reproducible on the very first attempt, not a rare race needing many iterations to catch, so the added complexity bought nothing.

## Known Issues / Tech Debt

None remaining — verified by 30 consecutive full-suite runs (`bun run test:repeat 30`, → [[wiki/components/e2e-tests]]) with zero failures.

## Related

[[wiki/components/e2e-tests]], [[wiki/issues/webview2-session-crash-on-fast-relaunch]], [[wiki/issues/prepare-sidecars-pkill-broad-match]], [[wiki/issues/e2e-linux-native-click-unreliable]]
