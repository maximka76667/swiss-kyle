# User-Friendly Process Errors

**Type**: issue
**Summary**: Worker errors surface raw tool output (ffmpeg/pandoc stderr) instead of actionable guidance for the user.
**Tags**: #ux #errors #ffmpeg #pandoc
**Sources**: [[crates/worker/src/error.rs]], [[crates/worker/src/cut_video.rs]], [[crates/worker/src/convert_document.rs]]
**Related**: [[wiki/components/worker]]
**Last Updated**: 2026-07-02

---

## Overview

When ffmpeg or pandoc fails, the job history panel shows the last few lines of stderr. This is better than a raw exit code but still requires the user to understand tool internals. A normal user who drops a `.webm` file and gets output named `output.mp4` currently sees:

```
ffmpeg failed: [mp4 @ ...] Could not find tag for codec vp8 in stream #0, codec not currently supported in container
Conversion failed!
```

They have no idea what to do with that. The ideal error would say something like: "VP8 video cannot be saved as .mp4 — change the output filename to .webm."

## Known Cases

- **Container/codec mismatch**: `.webm` input with `-c copy` cannot be muxed into `.mp4`. Currently partially mitigated by auto-filling the output extension from the input, but the user can still manually type an incompatible extension.
- **No PDF engine**: pandoc exit 43 — now fixed by bundling typst, but if typst is missing the error is still cryptic.
- **Invalid input file**: ffmpeg/pandoc given a file they cannot read — stderr is noisy, real cause is buried.

## Proposed Fix

Add an error interpretation layer in `error.rs` (or per-tool) that pattern-matches known stderr strings and maps them to plain-language suggestions:

```rust
fn interpret(stderr: &str) -> Option<&str> {
    if stderr.contains("codec not currently supported in container") {
        return Some("The output format is incompatible with the input codec. Try changing the output file extension to match the input.");
    }
    if stderr.contains("No such file or directory") {
        return Some("Input file not found. Check that the file still exists at the original path.");
    }
    None
}
```

Return the interpreted message when available, fall back to the raw tail otherwise.

## Known Issues / Tech Debt

Low priority while the tool set is small. As more converters are added, the list of known error patterns will grow and the interpretation layer becomes more valuable.
