# E2E: Sidecars From One Spec File Leaked Into the Next's Process Checks

**Type**: issue
**Summary**: Resolved. WDIO tears down a spec file's session by force-terminating the app process, which skips Tauri's `RunEvent::ExitRequested` sidecar-kill cleanup — so `nats-server`/`worker` from a spec that never explicitly closed its window stayed alive and made a *later*, unrelated spec's process check fail.
**Tags**: #issue #resolved #e2e #testing #sidecars
**Sources**: [[e2e/wdio.conf.ts]], [[e2e/specs/sidecars.spec.ts]], [[src-tauri/src/lib.rs]]
**Related**: [[wiki/components/e2e-tests]], [[wiki/components/tauri-app]]
**Last Updated**: 2026-07-07

---

## Overview

After adding `cut-video.spec.ts` (which drops a file but never closes the app window), `sidecars.spec.ts`'s "kills sidecars when the window is closed normally" test started failing intermittently — but only when run as part of the full suite, and specifically only when `cut-video.spec.ts` ran immediately before it. Run alone, `sidecars.spec.ts` passed every time.

## Details

Reproduced deterministically with just two specs (`cut-video.spec.ts` then `sidecars.spec.ts`), confirmed via a background PID poll during the run:

1. Every spec launches its own fresh `app.exe` instance (own WebDriver session, `maxInstances: 1`). The app spawns `nats-server`/`worker` on every launch.
2. The app only kills those children on `RunEvent::ExitRequested`/`RunEvent::Exit` (`src-tauri/src/lib.rs`) — i.e. only on a graceful window close.
3. `cut-video.spec.ts` never called `plugin:window|close`. When its WDIO session ended, the driver force-terminated the app process without going through Tauri's close flow, so its `nats-server`/`worker` children were orphaned (parent gone, children still running).
4. `sidecars.spec.ts`'s own checks (`isProcessRunning`) match by process **name**, system-wide — not scoped to a specific PID or app instance. So by the time its own "kills sidecars on close" test ran (and correctly killed *its own* sidecars), the leftover orphans from `cut-video.spec.ts` were still alive and made the check see processes that were "still running."

The app does have a self-heal for orphaned sidecars from a crashed previous run (`kill_leftover_sidecars`, reads a PID file at startup) — but that only runs on the *next* app launch, and evidently wasn't reliably catching this particular timing.

## Decisions & Rationale

Fixed at the test-harness level, not in the app: every spec should leave its window closed when done, so `RunEvent::ExitRequested` cleanup runs deterministically regardless of what any individual spec tests. Added a global WDIO `after` hook (`e2e/wdio.conf.ts`) that closes the window (`plugin:window|close` over IPC) at the end of every spec file, wrapped in try/catch (a spec that already closed its own window, like `sidecars.spec.ts`, or one whose session already died, hits the catch and logs — harmless).

Considered and rejected: adding an explicit close call to the end of `cut-video.spec.ts` only. Rejected because every future "small step" spec (per the incremental-testing approach used here) would need to remember the same boilerplate; a global hook makes correctness the default instead.

## Known Issues / Tech Debt

None remaining for this specific failure mode — reproduced reliably before the fix, and the full 5-spec suite has since passed cleanly multiple times with the `after` hook in place. A separate, not-yet-root-caused transient WebView2 session flakiness is tracked in [[wiki/components/e2e-tests]]'s Known Issues.

## Related

[[wiki/components/e2e-tests]], [[wiki/components/tauri-app]]
