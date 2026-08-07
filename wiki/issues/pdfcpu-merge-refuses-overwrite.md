# pdfcpu Merge Refuses to Overwrite

**Type**: issue
**Summary**: Resolved. `pdfcpu merge` refuses to overwrite an existing output file by default, so re-running a merge with an unchanged output title failed the job instead of replacing the file; fixed by passing `--force`, matching `cut_video.rs`'s existing overwrite-by-default behavior via ffmpeg's `-y`.
**Tags**: #issue #resolved #worker #pdfcpu #merge-pdfs
**Sources**: [[crates/worker/src/merge_pdfs.rs]], [[crates/worker/src/cut_video.rs]], [[e2e/specs/merge-pdfs.spec.ts]]
**Related**: [[wiki/components/worker]], [[wiki/components/tauri-app]], [[wiki/components/e2e-tests]]
**Last Updated**: 2026-08-07

---

## Overview

Merging the same set of PDFs twice with an unchanged output title (the default output stem is `"merged"`) failed on the second attempt: `pdfcpu` errored with `refusing to overwrite existing file: ...merged.pdf. Use --force to overwrite.`, and the job surfaced as `Failed` in the UI instead of silently replacing the previous output.

## Details

`merge_pdfs.rs` shells out to `pdfcpu merge <output> <inputs...>` with no overwrite flag. Unlike ffmpeg (used by `cut_video.rs`, which already passes `-y` and overwrites unconditionally), `pdfcpu` treats an existing output path as a hard error unless `--force` is explicitly passed.

This made the app inconsistent: cutting a video with a reused output name silently overwrites, while merging PDFs with a reused output title hard-fails — the same "same output name reused" scenario handled two different ways by two different tools in the same app.

## Decisions & Rationale

Two options were considered: a UI confirmation/checkbox before overwriting, or overwriting by default. Overwrite-by-default was chosen specifically for consistency with the existing `cut_video.rs` precedent — a checkbox would have made Merge PDFs the only tool in the app that asks before overwriting, which is more surprising than helpful given the rest of the app already overwrites silently. Fixed by adding `--force` to the `pdfcpu merge` invocation in `merge_pdfs.rs`.

## Known Issues / Tech Debt

None — resolved. Covered by an e2e regression test (`merge-pdfs.spec.ts`) that merges two PDFs, submits again with the same output title but reversed input order, and asserts the output file's bytes actually changed — not just that the job reported `Done` twice, which alone couldn't distinguish a real overwrite from a job that succeeded without touching the existing file.

## Related

[[wiki/components/worker]], [[wiki/components/tauri-app]], [[wiki/components/e2e-tests]]
