# E2E Tests

**Type**: component
**Summary**: `e2e/` — WebdriverIO + `tauri-driver` suite that drives the real, packaged Tauri app (real WebView2, real sidecars) end to end; no mocking layer.
**Tags**: #component #testing #e2e #webdriverio #tauri
**Sources**: [[e2e/wdio.conf.ts]], [[e2e/package.json]], [[e2e/repeat.ts]], [[e2e/specs/smoke.spec.ts]], [[e2e/specs/sidecars.spec.ts]], [[e2e/specs/cut-video.spec.ts]], [[e2e/specs/doc-converter.spec.ts]], [[e2e/specs/merge-pdfs.spec.ts]], [[e2e/specs/navigation.spec.ts]], [[e2e/support/selectors.ts]], [[e2e/support/drag-drop.ts]], [[e2e/support/navigate.ts]], [[e2e/support/click.ts]], [[src-tauri/capabilities/default.json]], [[crates/shared/src/lib.rs]], [[ui/src/hooks/use-file-drop.ts]], [[.env.development]]
**Related**: [[wiki/components/frontend]], [[wiki/components/tauri-app]], [[wiki/issues/e2e-sidecar-leak-across-specs]], [[wiki/issues/tauri-resource-copy-only-on-app-rebuild]], [[wiki/issues/webview2-session-crash-on-fast-relaunch]], [[wiki/issues/e2e-linux-native-click-unreliable]], [[wiki/issues/e2e-file-drop-listener-race]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]
**Last Updated**: 2026-07-10

---

## Overview

`e2e/` is a separate Bun/TypeScript package (its own `package.json`, not part of the `ui/`/`src-tauri/`/`crates/` workspace) that runs WebdriverIO against the app through [`tauri-driver`](https://github.com/tauri-apps/tauri/tree/dev/tooling/webdriver) — a WebDriver-protocol bridge that launches the built `app.exe`/binary and forwards commands to its WebView (Edge WebView2 on Windows, `webkit2gtk-driver` on Linux). Nothing is mocked: sidecars really spawn, NATS really runs, the window is a real OS window.

Run with `bun run test:e2e` from the repo root (`package.json`'s `test:e2e` script is `bun --cwd=e2e run test`), or `bun run test` directly from `e2e/` (see the README). The `test` script (`e2e/package.json`) is fully self-sufficient: it runs `scripts/prepare-sidecars.ts` (rebuilds the `swiss-kyle-worker` sidecar), then `cargo build --manifest-path ../src-tauri/Cargo.toml` (rebuilds `app.exe`), then `wdio run ./wdio.conf.ts` — in that order, for a reason that isn't obvious (→ [[wiki/issues/tauri-resource-copy-only-on-app-rebuild]]). Use `bun run test`, **not** `bun test` — bare `bun test` invokes Bun's own test runner instead, which doesn't provide the `browser`/`expect` WDIO globals and fails every spec with `ReferenceError: browser is not defined`.

## Details

### Harness (`wdio.conf.ts`)

- `onPrepare`: starts the Vite dev server (`bun dev` in `ui/`) and waits for port 5173, then spawns `tauri-driver` (must be on `PATH`, installed via `cargo install tauri-driver`) and waits for port 4444.
- `capabilities`: a single `tauri:options.application` entry pointing at `target/debug/app.exe`. This is a vendor/extension capability (like `goog:chromeOptions`) — `tauri-driver`-specific, not in WebdriverIO's own types, hence the `// @ts-expect-error` above it.
- `maxInstances: 1`: spec files run serially, one app launch per spec file, one `tauri-driver`/WebView2 session at a time.
- `after`: closes the app window (`plugin:window|close` over IPC) at the end of every spec file, so `RunEvent::ExitRequested` cleanup always runs before the next spec launches (→ [[wiki/issues/e2e-sidecar-leak-across-specs]]).
- `onComplete`: force-kills the vite and `tauri-driver` process trees.

### App boot state

`ui/src/main.tsx` uses `MemoryRouter` with `initialEntries={['/cut-video']}` (→ [[wiki/components/frontend]]), so every fresh launch boots directly onto the Cut Video tool — no navigation needed to reach it. Reaching Doc Converter or Merge PDFs requires driving the sidebar (see `openTool` below).

### Support helpers (`e2e/support/`)

- **`selectors.ts` — `byText(text)`**: WebdriverIO's `$('=text')`/`$('*=text')` shorthand only means *link text* (exact/partial), and only matches `<a>` elements — it silently never matches a plain `<div>`/`<p>`, so a `waitForDisplayed` on it just polls uselessly until timeout. `byText` instead builds an xpath (`//*[contains(text(), '...')]`) that matches any element by visible text content.
- **`drag-drop.ts` — `dropFile(path)`**: there's no real OS drag to script (the file never crosses the OS boundary in a WebDriver session), so this fires the same `tauri://drag-drop` event the WebView2 host emits on a real drop, via `window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position } })`. This reaches the app's real listener (`useFileDrop` → `getCurrentWebview().onDragDropEvent`, → [[wiki/components/frontend]]) identically to a genuine drop. `plugin:event|emit` needs no extra capability — `core:event:default` (bundled in `core:default`) already grants `allow-emit`. Waits for `[data-drop-ready="true"]` before emitting — `useFileDrop`'s listener registration is an async IPC round-trip, not synchronous with the dropzone rendering (→ [[wiki/issues/e2e-file-drop-listener-race]]).
- **`navigate.ts` — `openTool(label)`**: clicks the sidebar's `[data-slot="sidebar-trigger"]` toggle to expand it, then clicks the tool's label text via `byText`. Needed for any tool other than Cut Video (see App boot state above).
- **`click.ts` — `jsClick(el)`**: WebdriverIO's native `.click()` (a synthesized OS-level pointer click) doesn't reliably activate elements through `wry`'s Linux backend — confirmed to produce zero successful navigations across repeated runs (→ [[wiki/issues/e2e-linux-native-click-unreliable]]). `jsClick` waits for the element to exist, then dispatches `.click()` directly on the resolved DOM element via `browser.execute()`, sidestepping the broken pointer-coordinate path. Used for the sidebar trigger, nav-item labels, and the "Submit job" button. Windows/WebView2 isn't affected by the underlying bug, but this works there too.

### Direct IPC calls without a UI trigger

Some behavior has no UI element to click (closing the window from a test, in particular). These specs call `window.__TAURI_INTERNALS__.invoke(command, args)` directly from `browser.execute()`, bypassing the UI entirely — e.g. `sidecars.spec.ts` invokes `plugin:window|close` to test the real `WindowEvent::CloseRequested` → `RunEvent::ExitRequested` cleanup path (→ [[wiki/components/tauri-app]]), which brower.closeWindow()/WDIO's own session teardown can't exercise (they force-kill instead).

This is also why `src-tauri/capabilities/default.json` grants `core:window:allow-close` — `core:default` doesn't include it, and without it that IPC call rejects with `javascript error: window.close not allowed`.

### Specs

| File | Covers |
|---|---|
| `smoke.spec.ts` | App launches: webview document title populates; native OS window title matches (Windows only — skipped elsewhere, reading it needs a real window manager) |
| `sidecars.spec.ts` | `nats-server`/`swiss-kyle-worker` processes spawn and accept connections; closing the window kills them (→ [[wiki/components/tauri-app]] shutdown sequence, → [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]] for why the worker binary has that name and not just `worker`) |
| `cut-video.spec.ts` | Accepts a dropped video (`fixtures/sample.mp4`); rejects an unsupported extension (`fixtures/unsupported.txt`) with a toast; submits a real cut job and waits for "Done" in job history (happy path — real ffmpeg run) |
| `doc-converter.spec.ts` | Rejects an unsupported extension with a toast |
| `merge-pdfs.spec.ts` | Rejects a non-PDF drop with a toast |
| `navigation.spec.ts` | Drives `openTool()` for every tool (Doc Converter, Merge PDFs, Diagnostics, Cut Video) and asserts each one's page-specific marker renders — decoupled from each tool's own drop/validation test, added to catch navigation regressions directly (→ [[wiki/issues/e2e-linux-native-click-unreliable]]) |

### Output redirection (`.env.development`)

Job output (e.g. a cut video, a merged PDF) would otherwise land in the user's real `~/Documents/swiss-kyle/` (→ [[wiki/components/tauri-app]]) — undesirable for a test run, or even a normal debug session. `base_output_dir()` (`crates/shared/src/lib.rs`) checks for a checked-in `.env.development` at the repo root and, if present, redirects output under `<repo root>/.development/` instead — **in any debug build**, not just e2e runs (gated by `cfg!(debug_assertions)`, so it's compiled out entirely in release). Only the configured value's base name is used (via `Path::file_name()`), so the file can't specify a path that escapes `.development/` — which is gitignored wholesale, so the redirected value never needs mirroring in `.gitignore`.

This reads a real file rather than an environment variable because `tauri-driver` doesn't reliably forward its own environment down to the `app.exe` it launches — confirmed empirically (an env var set on the `tauri-driver` spawn never reached the worker's output path). The file is located via `env!("CARGO_MANIFEST_DIR")` (a compile-time constant), not the process's CWD, so `app.exe` and the separately-launched `worker.exe` resolve the same path independently of how or from where either was started.

### Fixtures (`e2e/fixtures/`)

Static input files committed to the repo (small — `sample.mp4` is ~15KB) so the suite is reproducible with no external download step: `sample.mp4` (valid video) and `unsupported.txt` (deliberately wrong extension for all three tools' validation tests).

### Repeated runs (`e2e/repeat.ts`)

`bun run test:repeat [count]` (default 10) reruns `wdio run ./wdio.conf.ts` against the already-built app binary that many times in a row, without rebuilding between iterations, and prints a `passed/total` tally plus which run numbers failed. For checking flakiness — a single clean run doesn't prove a fix, especially on Linux where several of the issues above only reproduced under repeated relaunches or system load. Standalone (no rebuild step), so it can be left running without needing anything beyond a already-built `target/debug/app`.

## Decisions & Rationale

Chose to simulate the OS-level drag-drop event over IPC rather than mocking `useFileDrop` or the dialog picker, and to drive real IPC commands (`window|close`) directly rather than only clicking UI — the goal is to exercise the app's actual production code paths (the same event, the same Rust-side `RunEvent` handling), not a test double standing in for them.

The native OS "Open File" dialog (`@tauri-apps/plugin-dialog`) is *not* covered — it's a real OS-chrome window outside the WebView's DOM, which `tauri-driver` (WebView-only) cannot see or interact with. Drag-and-drop shares the same downstream validation code, so it stands in as the testable input path.

## Known Issues / Tech Debt

- Resolved: sidecar processes from one spec file leaked into the next's process checks (→ [[wiki/issues/e2e-sidecar-leak-across-specs]]).
- Resolved: the worker sidecar silently ran stale code because `scripts/prepare-sidecars.ts` rebuilding it doesn't refresh the copy the running app actually spawns (→ [[wiki/issues/tauri-resource-copy-only-on-app-rebuild]]).
- Mitigated, not fully resolved: a fresh session launched too soon after the previous one's close crashed the new `app.exe` within ~1.5s of starting (→ [[wiki/issues/webview2-session-crash-on-fast-relaunch]]). An empirically binary-searched 4s delay in the `after` hook cut this from ~1-in-2 full-suite runs down to ~1-in-50 (not zero — confirmed by testing well past the first clean-looking batch). The precise WebView2-internal resource behind it wasn't identified — the delay is an empirical margin, not a wait on known state.
- Resolved: Linux driving (`wry`'s built-in WebDriver, `WebKitWebDriver` underneath) is now exercised — the suite runs the full spec set on Linux, not just Windows. Getting there surfaced three real, previously-invisible bugs: native pointer clicks don't reliably activate elements through `wry`'s Linux backend (→ [[wiki/issues/e2e-linux-native-click-unreliable]]); `useFileDrop`'s async listener-registration race (→ [[wiki/issues/e2e-file-drop-listener-race]]); and `sidecars.spec.ts`'s close test failing for two unrelated reasons, one an expected-but-unhandled Linux error shape, the other a `kworker`-thread substring collision in process-name matching (→ [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]). All three verified fixed by 30 consecutive full-suite runs (`bun run test:repeat 30`) with zero failures.

## Related

[[wiki/components/frontend]], [[wiki/components/tauri-app]], [[wiki/issues/e2e-sidecar-leak-across-specs]], [[wiki/issues/tauri-resource-copy-only-on-app-rebuild]], [[wiki/issues/webview2-session-crash-on-fast-relaunch]], [[wiki/issues/e2e-linux-native-click-unreliable]], [[wiki/issues/e2e-file-drop-listener-race]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]
