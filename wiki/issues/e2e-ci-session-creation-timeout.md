# E2E: Every CI Session Creation Times Out (Two Unrelated Causes, One Per OS)

**Type**: issue
**Summary**: The e2e suite passed 100% of the time run locally but failed every single spec in GitHub Actions on both matrix legs with `WebDriverError: ... timeout ... POST /session` — two distinct, platform-specific causes, not one: on Linux, `tauri-driver` starts before any display exists; on Windows, the preinstalled `msedgedriver` doesn't version-match the app's embedded WebView2 Runtime.
**Tags**: #issue #resolved #e2e #testing #ci #xvfb #webview2
**Sources**: [[e2e/wdio.conf.ts]], [[.github/workflows/ci.yml]]
**Related**: [[wiki/components/e2e-tests]], [[wiki/issues/webview2-session-crash-on-fast-relaunch]]
**Last Updated**: 2026-08-19

---

## Overview

The CI workflow (`.github/workflows/ci.yml`) was added recently. Its first real runs failed every spec file, on both `ubuntu-22.04` and `windows-latest`, with `webdriver`/`@wdio/runner` logging a `WebDriverError` for `POST http://127.0.0.1:4444/session` timing out (~2 minutes per attempt), then `[after hook] window already closed, skipping: TypeError: browser.execute is not a function` (a session that never opened has no `browser` to call). This is a different failure shape from [[wiki/issues/webview2-session-crash-on-fast-relaunch]]: that issue is an intermittent crash of the *next* session shortly after a *previous* one tears down. Here, every session failed outright, including the very first spec of the run, which has no previous session to have crashed from.

## Details

Both platforms share one proximate symptom — `tauri-driver` (listening on port 4444, confirmed reachable since `wdio.conf.ts`'s `waitForPort(4444)` in `onPrepare` didn't throw) never responds to a new-session request — but for two unrelated reasons:

**Linux — no display when `tauri-driver` starts.** `onPrepare` in `wdio.conf.ts` spawns `tauri-driver` directly (`spawn("tauri-driver", [])`) once, in the WDIO *launcher* process, before any worker exists. `ci.yml` installs `xvfb` as an apt package and relies on WDIO's built-in `@wdio/xvfb`, which auto-wraps each spec file's *worker* process in `xvfb-run` (visible in the logs as `@wdio/xvfb:ProcessFactory: Creating worker process with xvfb-run wrapper`) — but the launcher process, and everything it spawns (`tauri-driver`, and the `app` binary `tauri-driver` in turn launches), is never covered by that wrapping. With no `DISPLAY`, WebKitGTK can't initialize, so the app/`WebKitWebDriver` never becomes ready, and `tauri-driver` never answers the session POST. Tauri's own official CI recipe confirms this: it wraps the *entire* test command in `xvfb-run` (`xvfb-run yarn test`), not a per-worker mechanism, specifically so the display exists before `tauri-driver` itself starts.

**Windows — the preinstalled `msedgedriver` doesn't match the app's WebView2 Runtime version.** The Windows failure log is shaped differently from Linux's plain timeout: after ~60s, `webdriver` logs `WebDriverError: session not created: DevToolsActivePort file doesn't exist`, retries once, then times out for good on the retry. That message comes from `msedgedriver` itself (so a driver *was* found and *did* run — `windows-latest` images preinstall one at `C:\SeleniumWebDrivers\EdgeDriver`, already on `PATH`), reporting that the browser process it launched never opened its DevTools debugging port within the driver's own internal timeout — i.e. the app's WebView2 host failed to come up under that specific driver. The preinstalled driver is provisioned to match the machine's standalone **Edge browser app** version, but `tauri-driver` drives the **WebView2 Runtime** embedded in `app.exe` — a separately-versioned, independently-auto-updating component that routinely drifts out of sync with the Edge app version on the same machine. A version-mismatched `msedgedriver` against WebView2 is a documented cause of exactly this error. `ci.yml`'s `e2e` job never installed a WebView2-version-matched driver — only `tauri-driver` itself — so it fell back to whatever preinstalled, possibly-mismatched driver happened to be on `PATH` first.

## Decisions & Rationale

Fixed by matching Tauri's own documented CI recipe rather than guessing:

- **Linux**: `ci.yml`'s "Run e2e suite" step is now split by OS; the Linux leg runs `xvfb-run --auto-servernum bun run test:e2e`, wrapping the whole step (launcher process included) so a display exists before `onPrepare` ever spawns `tauri-driver`. `@wdio/xvfb`'s own per-worker wrapping is left in place (harmless, redundant once a display already exists) rather than disabled.
- **Windows**: a new "Install msedgedriver" step runs `cargo install --git https://github.com/chippers/msedgedriver-tool` then the tool itself, which — unlike the generic driver GH preinstalls — detects the runner's actual **WebView2 Runtime** version and downloads the matching `msedgedriver.exe` into the working directory; that directory is then added to `$GITHUB_PATH` ahead of the preinstalled one (`GITHUB_PATH` entries are prepended for later steps) so `tauri-driver` picks up the correctly-matched driver instead.

## Known Issues / Tech Debt

Fix applied but not yet confirmed by a green CI run — flag as still-open until the next `push` workflow run on both matrix legs passes. If it recurs on Windows specifically, the next thing to check is whether `msedgedriver-tool`'s own version detection is itself reading the Edge app version rather than the WebView2 Runtime version (the two Selenium/EdgeDriver ecosystem bugs found during investigation — [SeleniumHQ/selenium#12738](https://github.com/SeleniumHQ/selenium/issues/12738) and [#12958](https://github.com/SeleniumHQ/selenium/issues/12958) — describe exactly that class of mix-up in adjacent tooling).

## Related

[[wiki/components/e2e-tests]], [[wiki/issues/webview2-session-crash-on-fast-relaunch]]
