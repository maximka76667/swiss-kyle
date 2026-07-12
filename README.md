# <img src="docs/images/logo.png" alt="Swiss Kyle logo" width="32" align="center" style="vertical-align: middle; margin-bottom: 4px;"> Swiss Kyle

A desktop toolbox for local media and document jobs, built with Tauri 2 and React. Everything runs on your machine — no cloud, no uploads.

**Tools:**

- **Cut video** — trim clips with ffmpeg stream copy (`-c copy`), so cuts take seconds regardless of file size, with a scrubbing timeline and in-app preview.
- **Convert documents** — Markdown/HTML/Docx conversions via pandoc, PDF output via typst, and Office formats (doc/docx/odt/rtf) to PDF via LibreOffice or Microsoft Word (Windows only).
- **Merge PDFs** — combine PDFs in a drag-to-reorder list via [pdfcpu](https://pdfcpu.io/).

## Screenshots

![Cut video tool](docs/images/video-cut.png)

![Convert documents tool](docs/images/docs.png)

![Merge PDFs tool](docs/images/merging.png)

## How it works

The Tauri shell spawns two kinds of sidecar processes at startup:

- an embedded **NATS server** with JetStream, acting as a durable local job queue
- up to four **worker** processes (one per CPU core, capped at 4) that pull jobs from the queue and drive ffmpeg/pandoc/typst/pdfcpu/LibreOffice/Word

The UI submits jobs through Tauri commands (`src-tauri/src/commands.rs`), which publish job envelopes to JetStream. Workers ack with progress heartbeats while a job runs, so a crashed worker's jobs are redelivered quickly. Status and progress events flow back over NATS and are re-emitted to the UI as `job-status` events.

Video preview is served by a localhost HTTP server that only streams files registered through an unguessable token — it never serves arbitrary paths.

## Repo layout

```
ui/                   React + Vite frontend (bun)
src-tauri/            Tauri app shell: lifecycle, sidecar spawning, video server, commands
crates/shared/        Job types, NATS publisher, shared helpers
crates/worker/        Worker binary: job consumer + ffmpeg/pandoc/typst/pdfcpu runners
scripts/prepare-sidecars.ts   Builds the worker and downloads pinned sidecar binaries
e2e/                  WebdriverIO + tauri-driver end-to-end tests
wiki/                 LLM-maintained knowledge base (see CLAUDE.md)
```

## Development

Prerequisites: [Rust](https://rustup.rs/), [Bun](https://bun.sh/), and the [Tauri platform prerequisites](https://tauri.app/start/prerequisites/). For Office-to-PDF conversion you also need LibreOffice or (on Windows) Microsoft Word installed.

```sh
bun install
bun tauri dev
```

The dev command first runs `scripts/prepare-sidecars.ts`, which builds the worker crate and downloads sidecar binaries into `src-tauri/binaries/` — pinned versions of nats-server, pandoc, typst, and pdfcpu, plus the latest ffmpeg build. The first run is slow; afterwards the downloads are cached.

On Windows, if the Vite dev port is blocked after a reboot, see [WINDOWS-DEV.md](WINDOWS-DEV.md).

### Tests

```sh
bun run test:unit
```

(equivalent to plain `cargo test`, run from the repo root)

**End-to-end tests** drive the real built app through [`tauri-driver`](https://github.com/tauri-apps/tauri/tree/dev/tooling/webdriver) (real WebView, real sidecars, no mocking). One-time setup: `cargo install tauri-driver`. Job output during e2e runs (and any debug build) is redirected to `.development/` instead of your real Documents folder — see `.env.development`. Then, from the repo root:

```sh
bun install
bun run test:e2e
```

`test:e2e` rebuilds the worker sidecar and `app.exe` itself before running the suite, so it always tests current code — no separate build step needed.

### Production build

```sh
bun tauri build
```

## Releases

Releases are built by the [release workflow](.github/workflows/release.yml) (manual `workflow_dispatch` with a version input) for macOS (Apple Silicon and Intel), Linux, and Windows.
