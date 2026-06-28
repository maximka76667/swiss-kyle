# Frontend

**Type**: component
**Summary**: `swiss-kyle-ui/` — React/TypeScript/Vite app embedded in the Tauri window; provides the video file picker, in-browser video preview with timeline trim handles, job submission, and a live job history sidebar.
**Tags**: #component #react #frontend #tauri
**Sources**: [[swiss-kyle-ui/src/App.tsx]], [[swiss-kyle-ui/src/components/cut-video.tsx]], [[swiss-kyle-ui/src/components/video-player.tsx]], [[swiss-kyle-ui/src/components/timeline-slider.tsx]], [[swiss-kyle-ui/src/components/job-history.tsx]], [[swiss-kyle-ui/src/types/jobs.ts]]
**Related**: [[wiki/components/tauri-app]], [[wiki/components/video-server]], [[wiki/components/job-types]]
**Last Updated**: 2026-06-28

---

## Overview

The frontend is a single-page React app (Vite build, TypeScript, Tailwind + shadcn/ui components). It communicates with the Tauri backend exclusively through Tauri commands (`invoke`) and Tauri events (`listen`). There is no HTTP API call to any external service.

## Details

### Component tree

```
App
├── CutVideo          — main panel: file picker, VideoPlayer, start/end inputs, submit
│   └── VideoPlayer   — <video> element + TimelineSlider
│       └── TimelineSlider — drag handles for in/out points, playhead, click-to-seek
└── JobHistory        — right sidebar: list of TrackedJob rows with status badges and progress bars
```

### App.tsx — state and event wiring

`App` maintains a `TrackedJob[]` array. It registers a `job-status` Tauri event listener on mount:

```ts
listen<JobStatusEvent>('job-status', (event) => {
  setJobs(prev =>
    prev.map(job => job.id === event.payload.id
      ? { ...job, status: event.payload.status }
      : job)
  )
})
```

When `CutVideo` reports a successful submission (`onJobSubmitted(id, input, output)`), `App` appends a new `TrackedJob` with `status: 'Submitted'`. Subsequent NATS events (`Received`, `Processing`, `Done`, `Failed`) update that row in-place.

### VideoPlayer

Calls `invoke('get_stream_port')` once on mount, then constructs:

```ts
`http://127.0.0.1:${port}/?path=${encodeURIComponent(filePath)}`
```

and sets it as the `<video src>`. Listens to `loadedmetadata`/`durationchange`/`canplay` to detect when duration is available, then calls `onRangeChange(0, duration)` once. Seeking to `startSecs` is triggered by a `useEffect` on that value, so dragging the start handle repositions the playhead.

A `rangeInitialized` ref prevents `durationchange` or `canplay` from firing mid-playback and resetting the trim range.

### TimelineSlider

Custom pointer-capture drag implementation (no browser slider element). The track shows:
- Dimmed regions outside the selected range
- A border overlay for the selected region
- A red playhead line at `currentTime`
- Left and right drag handles (pointer-capture, `cursor-ew-resize`)

Clicking anywhere on the track fires `onSeek`. Time labels below show start / current / end in `M:SS.d` format.

### CutVideo

Uses `@tauri-apps/plugin-dialog`'s `open()` for the native file picker (filters: mp4, mov, mkv, webm). On submit, calls `invoke('submit_cut_job', { input, output, startSecs, endSecs })` which returns the ULID string for the new job.

### JobHistory

Right sidebar (shadcn `Sidebar`, 480 px wide, offcanvas collapsible). Each job shows:
- Output filename + source path
- Submission timestamp
- Status badge (`Submitted`/`Received`/`N%`/`Done`/`Failed`)
- Progress bar (only when `Processing`)
- Dismiss button (removes from in-memory list)
- Header button to open `~/Videos/swiss-kyle/` in the OS file manager

### Type definitions (`types/jobs.ts`)

TypeScript mirrors the Rust `JobStatus` enum exactly:

```ts
export type JobStatus =
  | 'Received'
  | { Processing: { percent: number } }
  | 'Done'
  | { Failed: { reason: string } }

export type TrackedJobStatus = JobStatus | 'Submitted'
```

`'Submitted'` is a frontend-only state indicating the job was sent but no NATS event has arrived yet.

## Decisions & Rationale

All job state is in-memory React state — no local storage, no IndexedDB. When the Tauri app restarts, the job history resets. This is intentional for now and tracked as a known issue (→ [[wiki/issues/missing-db-and-progress]]).

shadcn/ui is used for accessible, unstyled-base components (Sidebar, Badge, Progress, Button, etc.) rather than building them from scratch.

## Known Issues / Tech Debt

- Job history resets on app restart — no persistence layer yet.
- Start/end seconds inputs are also editable as plain number fields, which can get out of sync with the drag handles if typed manually while the slider is mounted.

## Related

[[wiki/components/tauri-app]], [[wiki/components/video-server]], [[wiki/components/job-types]]
