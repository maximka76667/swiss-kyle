# Shallow vs. Deep Module Audit

**Type**: issue
**Summary**: Open — an audit (not yet actioned) applying Ousterhout's *A Philosophy of Software Design* deep/shallow-module and information-hiding lens across the codebase, identifying concrete refactor candidates for the user to work through file by file.
**Tags**: #issue #tech-debt #refactoring #philosophy-of-software-design #deep-modules #information-hiding #open
**Sources**: [[src-tauri/src/video_server.rs]], [[src-tauri/src/job_log.rs]], [[src-tauri/src/commands.rs]], [[src-tauri/src/lib.rs]], [[crates/worker/src/cut_video.rs]], [[crates/worker/src/merge_pdfs.rs]], [[crates/worker/src/convert_document.rs]], [[crates/shared/src/lib.rs]], [[ui/src/hooks/use-file-drop.ts]], [[ui/src/components/cut-video.tsx]], [[ui/src/components/doc-converter.tsx]], [[ui/src/components/merge-pdfs.tsx]], [[ui/src/components/job-history.tsx]], [[ui/src/components/video-player.tsx]]
**Related**: [[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/components/worker]], [[wiki/components/job-types]]
**Last Updated**: 2026-08-07

---

## Overview

The user is reading *A Philosophy of Software Design* by John Ousterhout and asked for a codebase pass through two of its central ideas: **module depth** (a module's interface should be simple relative to the functionality it hides — deep good, shallow bad) and **information hiding / leakage** (a module should encapsulate a design decision, not expose it; leaked knowledge that's re-derived in multiple places causes change amplification when it's wrong or needs to change).

This page is a snapshot of that comparative read-through, not a set of applied changes. Per the user's instruction, no refactoring has been performed — this exists so the user can go through the flagged files themselves and decide what to act on.

## Details

### Deep modules (small interface, real complexity hidden — the target shape)

- **`Registry`** (→ [[wiki/components/video-server]], `src-tauri/src/video_server.rs:17-37`) — interface is just `register(path) -> token` / `get(token) -> path`. Hides the `Mutex<HashMap<...>>`, ULID token minting, and dedup-by-path logic entirely.
- **`JobLog`** (`src-tauri/src/job_log.rs:75-133`) — interface is `connect()` / `recent_logs()` / `write()`. Hides the full SurrealDB schema, the `LogRecord`↔`LogEntry` translation layer, and a subtle SurrealQL pruning-event bug (documented in the comment at lines 88-97) that would otherwise leak straight into every caller.
- **`cut_video::run` / `merge_pdfs::run` / `convert_document::run`** (`crates/worker/src/cut_video.rs`, `merge_pdfs.rs`, `convert_document.rs`) — each is `run(job, bins, ...) -> Result<(), _>`, hiding ffmpeg/pdfcpu argument construction, stderr progress-parsing, and non-obvious correctness fixes (the keyframe re-encode workaround at `cut_video.rs:33-43`).
- **`useFileDrop`** (`ui/src/hooks/use-file-drop.ts`) — interface is `onDrop` in, `{isDragging, ready}` out. Hides Tauri's WebView-level drag-drop event registration, a stale-closure ref trick, and an unlisten-during-pending-promise race.

### Shallow / leaky spots (refactor candidates)

- **Three near-identical tool components**: `ui/src/components/cut-video.tsx`, `doc-converter.tsx`, `merge-pdfs.tsx`. Each independently reimplements the same shape — a `basename()` helper, an extension-allowlist constant, an "unsupported file" toast, an `applyFile`/`pickFile` pair, and a `submit()` that calls `invoke` and toasts on failure. The same design decision (how to accept and validate a dropped/picked file) is encoded three separate times instead of hidden behind one shared module. A UX change to file validation is currently a three-file edit.
- **Duplicated format/converter knowledge across the Rust/TS boundary**: `crates/shared/src/lib.rs:126-157` defines `DocFormat`/`Converter` as the source of truth; `ui/src/components/doc-converter.tsx:15-36` independently redefines the same enum values, labels, and extension mapping in TypeScript with no shared codegen. Two places must be kept in sync by hand.
- **`ui/src/components/job-history.tsx:24-52`** — four free functions (`statusBadgeVariant`, `statusLabel`, `processingPercent`, `failureReason`) each independently narrow the same `TrackedJobStatus` union. The union's shape has leaked into four call sites instead of being hidden behind one accessor/presenter; adding a status variant means hunting down four places to update.
- **`src-tauri/src/commands.rs`** — mostly expected shallowness for an IPC boundary layer (each `#[tauri::command]` builds a struct and forwards to `publisher.publish`), not a smell on its own. `get_pdf_page_count` (`commands.rs:117-142`) is the outlier: it does real work (spawn_blocking, subprocess, JSON parsing) behind the same thin command shape as its genuinely-shallow siblings.

## Decisions & Rationale

No decisions made yet — this is a read-through, filed for the user to triage. The user's own workflow preference: point Claude at one of the flagged files/areas and specify what to change, rather than Claude refactoring proactively.

## Known Issues / Tech Debt

The four shallow/leaky items above are the open tech debt this page tracks:

1. Repeated file-pick/validate/submit logic across the three tool components.
2. `DocFormat`/`Converter` knowledge duplicated between `crates/shared` and `doc-converter.tsx`.
3. `TrackedJobStatus` narrowing repeated four times in `job-history.tsx`.
4. `get_pdf_page_count` sitting in `commands.rs` as a depth outlier among otherwise-thin pass-through commands.

## Related

[[wiki/components/video-server]], [[wiki/components/frontend]], [[wiki/components/worker]], [[wiki/components/job-types]]
