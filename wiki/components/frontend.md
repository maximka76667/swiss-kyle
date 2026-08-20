# Frontend

**Type**: component
**Summary**: `ui/` — React/TypeScript/Vite app embedded in the Tauri window; provides three tools (Edit Video, Doc Converter, Merge PDFs), drag-and-drop file picking, job submission, and a live job history sidebar.
**Tags**: #component #react #frontend #tauri
**Sources**: [[ui/src/App.tsx]], [[ui/src/main.tsx]], [[ui/src/components/edit-video.tsx]], [[ui/src/components/doc-converter.tsx]], [[ui/src/components/merge-pdfs.tsx]], [[ui/src/components/tool-nav.tsx]], [[ui/src/components/tool-page.tsx]], [[ui/src/components/video-player.tsx]], [[ui/src/components/crop-overlay.tsx]], [[ui/src/components/timeline-slider.tsx]], [[ui/src/components/job-history.tsx]], [[ui/src/hooks/use-file-drop.ts]], [[ui/src/lib/tools.ts]], [[ui/src/lib/utils.ts]], [[ui/src/types/jobs.ts]]
**Related**: [[wiki/components/tauri-app]], [[wiki/components/video-server]], [[wiki/components/job-types]], [[wiki/components/e2e-tests]], [[wiki/issues/e2e-file-drop-listener-race]]
**Last Updated**: 2026-08-19

---

## Overview

The frontend is a React app (Vite build, TypeScript, Tailwind + shadcn/ui). It communicates with the Tauri backend exclusively through `invoke` (commands) and `listen` (events). Navigation between tools uses React Router (`MemoryRouter`) — no URL bar, no server needed.

## Details

### Layout

```
MemoryRouter
└── App
    ├── SidebarProvider (left, 200px, collapsed by default)
    │   └── ToolNav            — collapsible icon sidebar; useNavigate/useLocation for active state
    └── SidebarInset
        └── SidebarProvider (right, 480px, offcanvas)
            ├── SidebarInset
            │   └── Routes
            │       ├── /edit-video    → EditVideo
            │       ├── /doc-converter → DocConverter
            │       └── /merge-pdfs    → MergePdfs
            ├── Sidebar (right) → JobHistory
            └── FloatingSidebarTrigger
```

`TOOLS` (`ui/src/lib/tools.ts`) is the single source of truth for this route/label/icon/component list — `ToolNav`, `App`'s `<Routes>`, and `JobHistory`'s icon lookup all read from it instead of each declaring their own copy.

### ToolPage

Shared layout wrapper used by every tool. Renders a centered `h1` title and description paragraph slightly above the vertical midpoint, then the tool's content below. The description accepts `React.ReactNode` so tools can embed clickable elements (e.g. the output folder link).

### File drop (`useFileDrop`)

All three tools take input files two ways: click-to-browse (native `@tauri-apps/plugin-dialog` `open()`, filtered by extension) or drag-and-drop. Drag-and-drop does **not** go through the browser's HTML5 DnD/`dataTransfer` API — Tauri intercepts OS-level file drops at the WebView layer so it can resolve real filesystem paths (browsers otherwise hide these). `useFileDrop` (`ui/src/hooks/use-file-drop.ts`) subscribes to `getCurrentWebview().onDragDropEvent(...)`, which is built on the `tauri://drag-drop`/`-enter`/`-over`/`-leave` events, and calls back with the dropped paths on a `drop` event.

`onDragDropEvent(...)` returns a Promise — the listener isn't actually attached the instant the hook runs, it's a real IPC round-trip to register on the Rust side. `useFileDrop` exposes this as a `ready: boolean`, flipped `true` only once that promise resolves, and each tool puts it on its dropzone element as `data-drop-ready` so both real usage and tests have something to check besides "did the dropzone render" (→ [[wiki/issues/e2e-file-drop-listener-race]] — a dropped file arriving before the listener attaches is silently lost, confirmed to happen under enough system load, not just a theoretical race).

Each tool's own `applyFile`/`addPaths` handler — not the drop handler itself — enforces the extension allowlist and shows a `sonner` error toast on rejection (CutVideo: `VIDEO_EXTS`; DocConverter: `INPUT_EXT_TO_FORMAT` keys; MergePdfs: must end in `.pdf`, partial-accepts a batch and reports how many were skipped). Drag-and-drop and the native picker share this same validation path. Covered end-to-end by [[wiki/components/e2e-tests]] (drop events are simulated by emitting `tauri://drag-drop` directly over IPC, since there's no real OS drag to script).

### EditVideo / DocConverter / MergePdfs (tool components)

Each tool has:

- A dashed drop zone (click to open native file picker, or drag-and-drop a file from the OS).
- Fields and submit button hidden until at least one valid file is selected.
- On submit: `invoke('submit_edit_video_job' | 'submit_doc_convert_job' | 'submit_merge_pdfs_job', ...)` returns a job ID; calls `onJobSubmitted(id, tool, input, output)`.

EditVideo auto-generates an output name from the input stem, keeping the original extension, and renders `VideoPlayer` with a start/end trim range and an always-visible crop selector once a file is loaded. Both "Start (s)"/"End (s)" and "Submit job" stay `disabled` until the video's metadata (duration, native pixel dimensions) has actually loaded — see the Crop subsection below for why that matters beyond just UX polish. `crop` is only sent to `submit_edit_video_job` when the selection differs from the untouched full-frame default, so a trim-only submission behaves exactly as it did before the crop feature existed.

DocConverter auto-generates an output stem and offers a **Convert to** format dropdown (the input's own format is filtered out of the choices) and, only when converting an office file (doc/docx/odt/rtf) to PDF, a **PDF converter** dropdown selecting Microsoft Word (Windows only) or LibreOffice.

MergePdfs accepts multiple files (batched drop or multi-select picker), lists them as reorderable rows (`@dnd-kit`, drag handle + up/down buttons), fetches each file's page count via `invoke('get_pdf_page_count', ...)`, and requires at least 2 entries before Merge is enabled.

### App.tsx — state and event wiring

`App` maintains a `TrackedJob[]` array (in-memory, resets on restart). It listens for `job-status` Tauri events and updates the matching job in place. A status event can arrive _before_ `handleJobSubmitted` has registered the job (the worker is fast and `invoke` hasn't resolved yet), so unmatched events are buffered in a `pendingEvents` ref keyed by job id:

```ts
listen<JobStatusEvent>("job-status", (event) => {
  setJobs((prev) => {
    if (!prev.find((j) => j.id === event.payload.id)) {
      pendingEvents.current.set(event.payload.id, event.payload.status); // buffer
      return prev;
    }
    return prev.map((job) =>
      job.id === event.payload.id
        ? { ...job, status: event.payload.status }
        : job,
    );
  });
});
```

`handleJobSubmitted(id, tool, input, output)` appends a new `TrackedJob`, using any buffered status for that id or `'Submitted'` otherwise. Each tool component passes its own tool identifier (`'edit-video'`, `'doc-converter'`, or `'merge-pdfs'`).

### JobHistory

Right sidebar (offcanvas). Each job row shows: tool icon, output filename, source path, timestamp, status badge, progress bar (video only), failure reason (if any), and a dismiss button. Header has a folder-open button (`invoke('open_output_folder', { subfolder: '' })`) for the base output directory.

### Output paths

- Edit Video: `~/Documents/swiss-kyle/edit-video/`
- Doc Converter: `~/Documents/swiss-kyle/convert-document/`
- Merge PDFs: `~/Documents/swiss-kyle/merge-pdfs/`

Both paths are clickable in the tool description (`invoke('open_output_folder', { subfolder: '...' })`).

### Video playback

`VideoPlayer` (used by EditVideo) streams its file through the local video server. It calls `invoke('get_stream_url', { path })`, which returns a token URL, and sets that as the `<video>` `src` (→ [[wiki/components/video-server]]).

### Crop (`CropOverlay`, `CropRect`)

`VideoPlayer` renders `CropOverlay` on top of the `<video>` element once its native `videoWidth`/`videoHeight` are known — always visible, no separate enable toggle. Four corner-bracket handles (drag to resize) plus drag-anywhere-on-the-rect-body (to move) update a `CropRect`, native source-video pixel units. `CropRect` (`ui/src/types/jobs.ts`) is a class, not a plain object type: its constructor rounds every field, since the drag math is float throughout (division by a CSS-to-video-pixel scale factor) but the value crosses the Tauri IPC boundary into a Rust struct typed `u32` — a stray float there makes serde reject the whole `invoke()` call outright. Every construction site goes through `new CropRect(...)`, not an object literal, so this can't be forgotten at a new call site the way a `roundRect()` helper function could be.

Letterboxing math (`ui/src/lib/utils.ts`'s `letterbox()`) maps between the crop rect's native-pixel coordinates and the overlay's rendered CSS position: `<video>` uses `object-fit: contain`, so whenever the source's aspect ratio doesn't match the rendered box (e.g. a portrait clip in a 16:9 panel), the actual visible content is a smaller, centered sub-rect of the element, not the full box. `letterbox()` and `clamp()` are both covered by `ui/src/lib/utils.test.ts` (`bun:test`) — the first frontend unit tests in this codebase (→ Frontend unit tests below).

`CropOverlay`'s own container is `pointer-events-none`, with only the crop rect and its handles opting back in via `pointer-events-auto` — without that split, the overlay's box (which fully covers the `<video>`, including its native controls bar) would silently swallow every click across the whole player, not just the crop area.

`VideoPlayer` is keyed on a `loadId` counter (bumped on every file pick in `EditVideo`), not on the file path: re-picking the *same* file leaves the path unchanged, so keying on it alone means React never remounts `VideoPlayer` and its internal metadata state never reloads — the parent's own `metadataLoaded`-derived state (which does reset on every pick) then has nothing to repopulate it, leaving trim/crop/submit permanently disabled. This was a real, user-reported bug, not a hypothetical.

### Type definitions (`types/jobs.ts`)

```ts
export type Tool = "edit-video" | "doc-converter" | "merge-pdfs";
export class CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  constructor(x: number, y: number, width: number, height: number); // rounds all four
}
export type JobStatus =
  | "Received"
  | { Processing: { percent: number } }
  | "Done"
  | { Failed: { reason: string } };
export type TrackedJobStatus = JobStatus | "Submitted";
export type TrackedJob = {
  id: string;
  tool: Tool;
  input: string;
  output: string;
  status: TrackedJobStatus;
  submittedAt: Date;
};
```

### Frontend unit tests

`ui/src/lib/utils.test.ts`, run via `bun test` (`bun run test:frontend` from the repo root, or `bun run test` from `ui/`) — Bun's built-in test runner, no new dependency. Covers `clamp` and `letterbox` (→ Crop above). This is the first frontend unit-test coverage in the repo; everything before it was e2e-only. `ui/tsconfig.app.json`'s `types` array needed `"bun"` added (alongside `"vite/client"`) for `bun:test`'s ambient types to resolve — it's a restrictive array, not the default "include everything in node_modules/@types" behavior.

## Decisions & Rationale

React Router `MemoryRouter` is used instead of `BrowserRouter` because there is no web server in a bundled Tauri app — hash or memory routing is required in production. `MemoryRouter` with `initialEntries={['/edit-video']}` means the app always starts on the Edit Video tool.

All job state is in-memory React state. This is a permanent decision, not a placeholder — restart-durable job history was decided against (→ [[wiki/issues/missing-db-and-progress]]).

## Known Issues / Tech Debt

- Job history resets on app restart — intentional, not a missing persistence layer (→ [[wiki/issues/missing-db-and-progress]]). A separate write-only diagnostic log (→ [[wiki/decisions/adr-003-embedded-surrealdb]]) will surface on its own Logs page, not as job-history persistence.
- PDF conversion has no progress — goes straight from `Received` to `Done`/`Failed` with no intermediate `Processing` state (pandoc does not expose progress).

Corrected stale claim (2026-07-07): an earlier version of this page said drag-and-drop had no extension validation. That was wrong even at the time — each tool's `applyFile`/`addPaths` handler validates the extension on drop, same as the picker. Now verified by [[wiki/components/e2e-tests]] (`edit-video.spec.ts`, `doc-converter.spec.ts`, `merge-pdfs.spec.ts` each assert the rejection toast on an unsupported drop).

## Related

[[wiki/components/tauri-app]], [[wiki/components/video-server]], [[wiki/components/job-types]], [[wiki/components/e2e-tests]]
