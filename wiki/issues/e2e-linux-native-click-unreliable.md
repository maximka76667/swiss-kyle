# E2E: Native WebDriver Clicks Unreliable on Linux (wry/WebKitGTK)

**Type**: issue
**Summary**: Resolved. WebdriverIO's native `.click()` (a synthesized OS-level pointer click at the element's computed screen coordinates) does not reliably activate elements through `wry`'s Linux WebDriver backend — confirmed by controlled comparison to produce zero successful sidebar navigations across repeated runs, while dispatching `.click()` directly on the resolved DOM element via `browser.execute()` worked every time. Windows/WebView2 is unaffected.
**Tags**: #issue #resolved #e2e #linux #wry #webkitgtk #flakiness
**Sources**: [[e2e/support/click.ts]], [[e2e/support/navigate.ts]], [[e2e/specs/cut-video.spec.ts]], [[e2e/specs/navigation.spec.ts]]
**Related**: [[wiki/components/e2e-tests]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]
**Last Updated**: 2026-07-10

---

## Overview

On Linux only, `openTool()` (clicking the sidebar trigger, then a tool's nav-item label) and the "Submit job" button click were unreliable: sometimes navigation silently failed to happen at all, sometimes — in the original bug report, before this was isolated — a click appeared to land on the sidebar row above the intended target. Windows never showed any version of this.

## Details

Several theories were investigated and ruled out before finding the real cause:

- **DPI/display-scale mismatch**: ruled out — `gsettings get org.gnome.desktop.interface scaling-factor` returned `0` (unset/1x), and the primary display's DPI (~110) isn't in HiDPI territory.
- **Window-decoration/title-bar coordinate offset**: ruled out by direct experiment — temporarily setting `"decorations": false` in `tauri.conf.json` and rebuilding produced an identical failure pattern (all 4 `navigation.spec.ts` tests still failed the same way), so the window chrome isn't the source of the offset.
- **XPath selector resolving to the wrong element**: ruled out — `byText()`'s XPath resolves to the innermost text-holding `<span>`, not its parent `<button>`, but this is the *same* code path on Windows, where it works every time.

What actually distinguishes the platforms: `wry`'s Linux backend doesn't reliably deliver a synthesized OS-level pointer click to these elements at all. A direct comparison — same test, same session — showed native `.click()` producing **zero** successful navigations across two full runs (with and without window decorations), while dispatching `.click()` on the already-resolved DOM element via `browser.execute()` produced successful navigations reliably (confirmed by navigating *away* from and *back to* the default route, which only passes if the click genuinely fired).

## Decisions & Rationale

Fixed in `e2e/support/click.ts`'s `jsClick()`: instead of a native pointer-coordinate click, it calls `element.click()` directly inside the page via `browser.execute()`, bypassing whatever is broken in `wry`'s Linux pointer-event synthesis entirely. Used for the sidebar trigger, sidebar nav-item labels (`navigate.ts`), and the "Submit job" button (`cut-video.spec.ts`).

`browser.execute()` has no built-in retry/wait the way WDIO's native `.click()` does (which auto-waits for the element to exist before acting) — so `jsClick()` calls `el.waitForExist({ timeout: 1500 })` first. Without this, the very first WebDriver command against a freshly-launched window can race React's initial mount and fail with "element ... wasn't found", since nothing else in that code path waits for mount first.

`navigation.spec.ts` was added specifically to catch this class of regression going forward — one `it` per tool, each asserting a page-specific marker renders after `openTool()`, decoupled from each tool's own drop/validation test.

## Known Issues / Tech Debt

The underlying defect is in `wry`'s Linux WebDriver pointer-click implementation itself, not something fixable from this repo — `jsClick()` works around it, it doesn't fix it upstream. No corresponding GitHub issue was found upstream during a search at the time of this investigation; worth filing one with this repro if it becomes relevant again (e.g. if `jsClick()` ever needs removing).

## Related

[[wiki/components/e2e-tests]], [[wiki/issues/e2e-sidecars-linux-close-and-worker-match]]
