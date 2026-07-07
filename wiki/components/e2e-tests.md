# E2E Tests

**Type**: component
**Summary**: `e2e/` — WebdriverIO + `tauri-driver` suite that drives the real, packaged Tauri app (real WebView2, real sidecars) end to end; no mocking layer.
**Tags**: #component #testing #e2e #webdriverio #tauri
**Sources**: [[e2e/wdio.conf.ts]], [[e2e/specs/smoke.spec.ts]], [[e2e/specs/sidecars.spec.ts]], [[e2e/specs/cut-video.spec.ts]], [[e2e/specs/doc-converter.spec.ts]], [[e2e/specs/merge-pdfs.spec.ts]], [[e2e/support/selectors.ts]], [[e2e/support/drag-drop.ts]], [[e2e/support/navigate.ts]], [[src-tauri/capabilities/default.json]]
**Related**: [[wiki/components/frontend]], [[wiki/components/tauri-app]], [[wiki/issues/e2e-sidecar-leak-across-specs]]
**Last Updated**: 2026-07-07

---

## Overview

`e2e/` is a separate Bun/TypeScript package (its own `package.json`, not part of the `ui/`/`src-tauri/`/`crates/` workspace) that runs WebdriverIO against the app through [`tauri-driver`](https://github.com/tauri-apps/tauri/tree/dev/tooling/webdriver) — a WebDriver-protocol bridge that launches the built `app.exe`/binary and forwards commands to its WebView (Edge WebView2 on Windows, `webkit2gtk-driver` on Linux). Nothing is mocked: sidecars really spawn, NATS really runs, the window is a real OS window.

Run with `bun run test` from `e2e/` (or the equivalent from the repo root — see the README). This invokes `wdio run ./wdio.conf.ts`, **not** `bun test` — bare `bun test` invokes Bun's own test runner instead, which doesn't provide the `browser`/`expect` WDIO globals and fails every spec with `ReferenceError: browser is not defined`.

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
- **`drag-drop.ts` — `dropFile(path)`**: there's no real OS drag to script (the file never crosses the OS boundary in a WebDriver session), so this fires the same `tauri://drag-drop` event the WebView2 host emits on a real drop, via `window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position } })`. This reaches the app's real listener (`useFileDrop` → `getCurrentWebview().onDragDropEvent`, → [[wiki/components/frontend]]) identically to a genuine drop. `plugin:event|emit` needs no extra capability — `core:event:default` (bundled in `core:default`) already grants `allow-emit`.
- **`navigate.ts` — `openTool(label)`**: clicks the sidebar's `[data-slot="sidebar-trigger"]` toggle to expand it, then clicks the tool's label text via `byText`. Needed for any tool other than Cut Video (see App boot state above).

### Direct IPC calls without a UI trigger

Some behavior has no UI element to click (closing the window from a test, in particular). These specs call `window.__TAURI_INTERNALS__.invoke(command, args)` directly from `browser.execute()`, bypassing the UI entirely — e.g. `sidecars.spec.ts` invokes `plugin:window|close` to test the real `WindowEvent::CloseRequested` → `RunEvent::ExitRequested` cleanup path (→ [[wiki/components/tauri-app]]), which brower.closeWindow()/WDIO's own session teardown can't exercise (they force-kill instead).

This is also why `src-tauri/capabilities/default.json` grants `core:window:allow-close` — `core:default` doesn't include it, and without it that IPC call rejects with `javascript error: window.close not allowed`.

### Specs

| File | Covers |
|---|---|
| `smoke.spec.ts` | App launches: webview document title populates; native OS window title matches (Windows only — skipped elsewhere, reading it needs a real window manager) |
| `sidecars.spec.ts` | `nats-server`/`worker` processes spawn and accept connections; closing the window kills them (→ [[wiki/components/tauri-app]] shutdown sequence) |
| `cut-video.spec.ts` | Accepts a dropped video (`fixtures/sample.mp4`); rejects an unsupported extension (`fixtures/unsupported.txt`) with a toast |
| `doc-converter.spec.ts` | Rejects an unsupported extension with a toast |
| `merge-pdfs.spec.ts` | Rejects a non-PDF drop with a toast |

### Fixtures (`e2e/fixtures/`)

Static input files committed to the repo (small — `sample.mp4` is ~15KB) so the suite is reproducible with no external download step: `sample.mp4` (valid video) and `unsupported.txt` (deliberately wrong extension for all three tools' validation tests).

## Decisions & Rationale

Chose to simulate the OS-level drag-drop event over IPC rather than mocking `useFileDrop` or the dialog picker, and to drive real IPC commands (`window|close`) directly rather than only clicking UI — the goal is to exercise the app's actual production code paths (the same event, the same Rust-side `RunEvent` handling), not a test double standing in for them.

The native OS "Open File" dialog (`@tauri-apps/plugin-dialog`) is *not* covered — it's a real OS-chrome window outside the WebView's DOM, which `tauri-driver` (WebView-only) cannot see or interact with. Drag-and-drop shares the same downstream validation code, so it stands in as the testable input path.

## Known Issues / Tech Debt

- Resolved: sidecar processes from one spec file leaked into the next's process checks (→ [[wiki/issues/e2e-sidecar-leak-across-specs]]).
- Occasional transient `WebDriverError`/`no such window` failures have been observed on `sidecars.spec.ts` when run as part of the full 5-spec suite (not reproducible when run alone or with fewer specs) — suspected WebView2/`tauri-driver` session-handoff flakiness under back-to-back session churn, not yet root-caused. Reruns have consistently passed.
- Linux driving (`webkit2gtk-driver`) is untested — the harness assumes `tauri-driver` resolves the right platform driver, but only Windows/WebView2 has actually been run.

## Related

[[wiki/components/frontend]], [[wiki/components/tauri-app]], [[wiki/issues/e2e-sidecar-leak-across-specs]]
