# OnlyOffice x2t Converter Broken + Remote Word Idea

**Type**: issue
**Summary**: The OnlyOffice x2t converter crashes on all files; a remote Word-on-VPS approach was considered as an alternative for cross-platform high-fidelity conversion.
**Tags**: #pdf #conversion #onlyoffice #word
**Sources**: [[crates/worker/src/convert_to_pdf.rs]]
**Related**: [[wiki/decisions/adr-001-local-only]], [[wiki/components/worker]]
**Last Updated**: 2026-06-29

---

## Overview

`x2t.exe` (OnlyOffice DesktopEditors converter) crashes on every file with a JavaScript TypeError in `AscCommon.zP.decode` (font decoding), followed by `DoctRenderer:<result><error code="open" /></result>`. This happens regardless of the input file and regardless of the arguments passed. The binary likely needs to run from its own directory to locate internal scripts and font resources, but even fixing that is fragile.

OnlyOffice has been left in the codebase but effectively does not work. The practical converter lineup is:

- **Windows** — Microsoft Word (COM) or LibreOffice
- **macOS / Linux** — LibreOffice only

## Remote Word-on-VPS idea

One considered alternative: host Microsoft Word on a Windows VPS, expose a small conversion endpoint, and have the local app POST the document, receive the PDF back. This would give Mac and Linux users Word-quality rendering without a local Word install.

**Why it wasn't done**: requires internet connectivity, adds a remote dependency to an otherwise fully local/offline pipeline (see [[wiki/decisions/adr-001-local-only]]), and implies non-trivial changes to the job submission and worker flow.

## Known Issues / Tech Debt

- OnlyOffice option is still shown in the UI and selectable, but will always fail.
- Either remove it from the UI or fix the x2t invocation (try running x2t with `current_dir` set to the converter's own directory).
