# OnlyOffice x2t Converter Broken + Remote Word Idea

**Type**: issue
**Summary**: Resolved by removal — the OnlyOffice x2t converter crashed on all files and has been dropped from the code and UI; a remote Word-on-VPS approach was considered but not adopted.
**Tags**: #pdf #conversion #onlyoffice #word #resolved
**Sources**: [[crates/worker/src/convert_document.rs]]
**Related**: [[wiki/decisions/adr-001-local-only]], [[wiki/components/worker]]
**Last Updated**: 2026-07-02

---

## Overview

**Resolved (2026-07-02): OnlyOffice/x2t has been removed entirely** — no `x2t`/`onlyoffice` references remain in the codebase, and the UI's PDF-converter dropdown now offers only Microsoft Word and LibreOffice. This page is kept as a record of why.

`x2t.exe` (OnlyOffice DesktopEditors converter) crashed on every file with a JavaScript TypeError in `AscCommon.zP.decode` (font decoding), followed by `DoctRenderer:<result><error code="open" /></result>`. This happened regardless of the input file and arguments. The binary likely needed to run from its own directory to locate internal scripts and font resources, but even fixing that was fragile — so it was dropped. The practical converter lineup is:

- **Windows** — Microsoft Word (COM) or LibreOffice
- **macOS / Linux** — LibreOffice only

## Remote Word-on-VPS idea

One considered alternative: host Microsoft Word on a Windows VPS, expose a small conversion endpoint, and have the local app POST the document, receive the PDF back. This would give Mac and Linux users Word-quality rendering without a local Word install.

**Why it wasn't done**: requires internet connectivity, adds a remote dependency to an otherwise fully local/offline pipeline (see [[wiki/decisions/adr-001-local-only]]), and implies non-trivial changes to the job submission and worker flow.

## Known Issues / Tech Debt

- None outstanding — OnlyOffice has been removed from both the worker and the UI. The remote Word-on-VPS idea remains available if cross-platform Word-fidelity conversion is ever needed, at the cost of breaking the offline model (→ [[wiki/decisions/adr-001-local-only]]).
