# useFileDrop's Listener Registration Race

**Type**: issue
**Summary**: Resolved. `useFileDrop`'s `onDragDropEvent()` listener registration is an async IPC round-trip, not synchronous with the component's render — a drop (real or e2e-synthesized) that arrives before it resolves is silently lost. Fixed by exposing real listener-readiness via a `data-drop-ready` DOM attribute instead of relying on rendered text as a proxy for it.
**Tags**: #issue #resolved #frontend #e2e #race-condition
**Sources**: [[ui/src/hooks/use-file-drop.ts]], [[ui/src/components/cut-video.tsx]], [[ui/src/components/doc-converter.tsx]], [[ui/src/components/merge-pdfs.tsx]], [[e2e/support/drag-drop.ts]]
**Related**: [[wiki/components/frontend]], [[wiki/components/e2e-tests]]
**Last Updated**: 2026-07-10

---

## Overview

`e2e/specs/cut-video.spec.ts`'s "accepts a video dropped onto the window" test was intermittently failing: `dropFile()` would emit the synthetic `tauri://drag-drop` event, but the app never showed the dropped filename — as if the drop had simply never happened. The test already had a wait in place (for the dropzone's text to render) specifically to guard against firing a drop before the app was ready; it wasn't enough.

## Details

`useFileDrop` (`ui/src/hooks/use-file-drop.ts`) registers its drop listener like this:

```ts
getCurrentWebview()
  .onDragDropEvent((event) => { ... })
  .then((fn) => { unlisten = fn; });
```

`onDragDropEvent()` returns a **Promise** — registering the listener is a real IPC round-trip to the Rust side, not something that completes synchronously with the component's render. The dropzone's "Drag & drop a video here" text renders immediately on mount, well before that promise necessarily resolves. A test (or a real user, if they're fast enough, though a human drag rarely wins this race) that waits only for the dropzone to be *visible* is waiting for the wrong signal — visible DOM and an attached listener are two different kinds of "ready" that happen to usually-but-not-always line up.

This is the same *class* of bug as the sidebar-trigger mount race in `jsClick()` (→ [[wiki/issues/e2e-linux-native-click-unreliable]]): DOM-rendered is being used as a stand-in for "the async thing behind it is done," and the two aren't actually coupled. It normally goes unnoticed because the IPC round-trip is fast — but this investigation involved dozens of rapid app relaunches in a short window, which was enough system load to occasionally lose the race and expose it.

## Decisions & Rationale

`useFileDrop` now returns a `ready: boolean`, flipped to `true` only once the listener-registration promise actually resolves — not when the component renders. `cut-video.tsx`, `doc-converter.tsx`, and `merge-pdfs.tsx` (all three consumers) put this on their dropzone element as `data-drop-ready`, so it's something the DOM — and therefore WebdriverIO — can actually observe. `e2e/support/drag-drop.ts`'s `dropFile()` now waits for `[data-drop-ready="true"]` before emitting, instead of each spec separately waiting on dropzone text.

This is a real correctness fix for the app itself, not just a test workaround — the underlying race exists for genuine user drops too, it's just far less likely to be lost since a human dragging a file in is almost always slower than the IPC round-trip.

## Known Issues / Tech Debt

None — verified by 30 consecutive full-suite runs with zero failures after the fix (→ [[wiki/components/e2e-tests]]).

## Related

[[wiki/components/frontend]], [[wiki/components/e2e-tests]], [[wiki/issues/e2e-linux-native-click-unreliable]]
