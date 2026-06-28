# Frontend

**Type**: component
**Summary**: `swiss-kyle-ui/` — React/TypeScript/Vite app embedded in the Tauri window; provides two tools (Cut Video, PDF Converter), drag-and-drop file picking, job submission, and a live job history sidebar.
**Tags**: #component #react #frontend #tauri
**Sources**: [[swiss-kyle-ui/src/App.tsx]], [[swiss-kyle-ui/src/main.tsx]], [[swiss-kyle-ui/src/components/cut-video.tsx]], [[swiss-kyle-ui/src/components/word-to-pdf.tsx]], [[swiss-kyle-ui/src/components/tool-nav.tsx]], [[swiss-kyle-ui/src/components/tool-page.tsx]], [[swiss-kyle-ui/src/components/video-player.tsx]], [[swiss-kyle-ui/src/components/job-history.tsx]], [[swiss-kyle-ui/src/types/jobs.ts]]
**Related**: [[wiki/components/tauri-app]], [[wiki/components/video-server]], [[wiki/components/job-types]]
**Last Updated**: 2026-06-28

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
            │       ├── /cut-video   → CutVideo
            │       └── /word-to-pdf → WordToPdf
            ├── Sidebar (right) → JobHistory
            └── FloatingSidebarTrigger
```

### ToolPage

Shared layout wrapper used by every tool. Renders a centered `h1` title and description paragraph slightly above the vertical midpoint, then the tool's content below. The description accepts `React.ReactNode` so tools can embed clickable elements (e.g. the output folder link).

### CutVideo / WordToPdf (tool components)

Each tool has:
- A dashed drop zone (click to open native file picker, or drag-and-drop a file from the OS). File path is read from `(file as any).path` which Tauri's webview adds to `File` objects.
- Auto-generated output filename derived from the input stem + original extension (CutVideo appends `-cut`; WordToPdf changes extension to `.pdf`).
- Fields and submit button hidden until a file is selected.
- On submit: `invoke('submit_cut_job' | 'submit_word_to_pdf_job', ...)` returns a job ID; calls `onJobSubmitted(id, tool, input, output)`.

### App.tsx — state and event wiring

`App` maintains a `TrackedJob[]` array (in-memory, resets on restart). It listens for `job-status` Tauri events and updates the matching job in place:

```ts
listen<JobStatusEvent>('job-status', (event) => {
  setJobs(prev => prev.map(job =>
    job.id === event.payload.id ? { ...job, status: event.payload.status } : job
  ))
})
```

`handleJobSubmitted(id, tool, input, output)` appends a new `TrackedJob` with `status: 'Submitted'`. Each tool component passes its own tool identifier (`'cut-video'` or `'word-to-pdf'`).

### JobHistory

Right sidebar (offcanvas). Each job row shows: tool icon, output filename, source path, timestamp, status badge, progress bar (video only), failure reason (if any), and a dismiss button. Header has a folder-open button (`invoke('open_output_folder', { subfolder: '' })`) for the base output directory.

### Output paths

- Cut Video: `~/Documents/swiss-kyle/cut-video/`
- PDF Converter: `~/Documents/swiss-kyle/convert-to-pdf/`

Both paths are clickable in the tool description (`invoke('open_output_folder', { subfolder: '...' })`).

### Type definitions (`types/jobs.ts`)

```ts
export type Tool = 'cut-video' | 'word-to-pdf'
export type TrackedJobStatus = 'Submitted' | 'Received' | { Processing: { percent: number } } | 'Done' | { Failed: { reason: string } }
export type TrackedJob = { id: string; tool: Tool; input: string; output: string; status: TrackedJobStatus; submittedAt: Date }
```

## Decisions & Rationale

React Router `MemoryRouter` is used instead of `BrowserRouter` because there is no web server in a bundled Tauri app — hash or memory routing is required in production. `MemoryRouter` with `initialEntries={['/cut-video']}` means the app always starts on the Cut Video tool.

All job state is in-memory React state. This is intentional for now and tracked as a known issue (→ [[wiki/issues/missing-db-and-progress]]).

## Known Issues / Tech Debt

- Job history resets on app restart — no persistence layer yet (→ [[wiki/issues/missing-db-and-progress]]).
- Drag-and-drop has no file extension validation — the drop handler accepts any file, bypassing the extension filter enforced by the native file picker dialog.
- PDF conversion has no progress — goes straight from `Received` to `Done`/`Failed` with no intermediate `Processing` state (pandoc does not expose progress).

## Related

[[wiki/components/tauri-app]], [[wiki/components/video-server]], [[wiki/components/job-types]]
