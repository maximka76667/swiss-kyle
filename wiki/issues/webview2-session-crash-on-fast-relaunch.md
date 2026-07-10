# E2E: New WebView2 Session Crashes If Launched Too Soon After the Previous One Closes

**Type**: issue
**Summary**: Mitigated, not fully resolved. Launching a fresh `tauri-driver` session immediately after the previous spec's session closed intermittently crashed the new `app.exe` instance within ~1.5s of starting — before its own sidecars finished spawning. An empirically-tuned 4-second delay between sessions in `wdio.conf.ts`'s `after` hook cut the failure rate from ~1-in-2 full-suite runs to roughly 1-in-50 (1 failure in a 51-run sample at 4000ms) — a real, large improvement, but not zero.
**Tags**: #issue #resolved #e2e #testing #flakiness #webview2
**Sources**: [[e2e/wdio.conf.ts]]
**Related**: [[wiki/components/e2e-tests]], [[wiki/issues/e2e-sidecar-leak-across-specs]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]
**Last Updated**: 2026-07-10

---

## Overview

After fixing the sidecar-process leak (→ [[wiki/issues/e2e-sidecar-leak-across-specs]]), the full 5-spec suite still failed intermittently — most often (but not exclusively) on `sidecars.spec.ts`, with varying error signatures (`nats-server/worker were still running`, or `WebDriverError: no such window: target window already closed`). It never reproduced when the failing spec ran alone or with only one spec before it — only as part of the full sequential run, and only sometimes.

## Details

Root-caused by polling the Windows process list (PID/name/parent-PID) every 300-500ms across several full-suite runs, comparing a passing run's process tree against a failing one's.

**First attempt, wrong theory**: assumed the issue was the *previous* session's process/resources not fully released — so `after` was changed to poll for the app's own process (`ps-list`, matching name `app`/`app.exe`) to disappear before returning, instead of a fixed delay. This performed *worse* (2/5 failures) than a blind delay, and total run time dropped sharply, meaning the check was returning almost instantly — the app process disappears from the OS process list fast regardless of whether the crash is about to happen. Wrong condition.

**Second attempt, correct diagnosis**: closer inspection of a failing run's process-tree log showed the actual mechanism directly. In every *passing* spec's launch, `app.exe` persists across several poll snapshots (3+ seconds) with `nats-server` and all 4 `worker` processes visible together. In the *failing* spec's launch, `app.exe` appeared in exactly one snapshot with only `nats-server` visible, then was completely gone one snapshot later (~1.5s) — while its own child `msedgewebview2.exe` processes were still listed, orphaned, still tagged with the now-dead PID as their parent.

So the app process itself was crashing and exiting abnormally fast — not "still running" (the original leak symptom), not simply a leftover from an earlier spec. The specific WebView2-internal resource causing this isn't nameable/pollable from outside the process (not a distinctly-named OS process); it's presumably something Edge/WebView2-internal not yet released from the previous session's teardown when the next one tries to initialize.

## Decisions & Rationale

Since the real blocking condition isn't observable from the test harness, a condition-based wait isn't achievable with the tools available (short of Windows crash-dump/ETW-level tracing, judged not worth it for a test-harness timing issue). Settled for an empirically-tuned fixed delay in the `after` hook, after the window-close call, before the session tears down and the next spec's session begins.

Tuned via binary search on full-suite pass rate (not a single spec in isolation, since the crash only manifests under real back-to-back session churn):

| Delay | Result |
|---|---|
| 0ms (baseline, no delay) | ~1-in-2 full-suite runs failed |
| 2000ms | ~1-in-4 failed |
| 3000ms | 1/8 failed |
| 3500ms | 1/25 failed (~4%) |
| 4000ms | 0/20 failed in the first batch — then 1/30 failed in a follow-up batch (1/51 overall, ~2%) |

4000ms was chosen over 3500ms as the clearly better tradeoff (~2% vs ~4%+ residual failure rate), not as a guaranteed fix — a first batch of 20 with zero failures looked clean, but a larger follow-up batch (prompted by suspicion that the good streak was still just luck, which proved correct) surfaced one more failure. This matches 3500ms's own pattern (clean 10/10, then a failure in the next 15) — small samples of a low-probability event understate its true rate.

## Known Issues / Tech Debt

Not fully fixed — the residual ~2% failure rate at 4000ms is real, confirmed by testing well past the point the first clean batch would have suggested "resolved." The 4000ms figure is an empirical margin on one development machine under one load profile, not a principled bound — it could need retuning (or accepting a nonzero baseline failure rate) on different hardware, under different system load, or in CI. The underlying WebView2-level resource has not been identified precisely; doing so would need Windows crash-dump or ETW-level tracing. If this becomes disruptive, that deeper investigation — or an occasional-failure-tolerant CI retry policy — is probably a better next step than pushing the delay higher, which has diminishing returns and directly costs wall-clock time on every run.

A superficially similar Linux failure in `sidecars.spec.ts` was initially suspected to be this same bug reappearing on a new platform — it wasn't. Confirmed unrelated by direct investigation (→ [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]): the Linux failure was 100% reproducible on the very first attempt at zero delay, not a rare timing-sensitive race, and traced to two different causes (an expected-but-unhandled error from the window-close call, and an unrelated process-name matching bug). Worth remembering that not every "session died shortly after launch"-shaped failure is this issue.

## Related

[[wiki/components/e2e-tests]], [[wiki/issues/e2e-sidecar-leak-across-specs]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]
