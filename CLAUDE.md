# LLM Wiki — Software Project Knowledge Base

A persistent, structured knowledge base maintained by Claude Code.
Based on Andrej Karpathy's LLM Wiki pattern.

## Purpose

This wiki accumulates knowledge about this codebase over time. Claude maintains it.
The human adds sources, asks questions, and guides the analysis.
**Humans do not write wiki pages directly** — treat the wiki as Claude's output layer.

---

## Folder structure

```
src/                        ← source material (immutable — never modify these)
  code/                     ← source files, diffs, PR exports, stack traces

docs/                     ← READMEs, specs, RFCs, design docs, ADRs
  external/                 ← third-party docs, library changelogs, blog posts

wiki/                       ← Claude's structured knowledge layer (Claude writes here)
  index.md                  ← table of contents for the entire wiki
  log.md                    ← append-only record of every operation
  architecture/             ← system design, component maps, data flow diagrams
  components/               ← one page per significant module, service, or class
  decisions/                ← architecture decision records (ADRs)
  concepts/                 ← key domain concepts, patterns, and terminology
  dependencies/             ← external libraries and integrations
  questions/                ← answered questions filed as pages for future reference
  issues/                   ← known bugs, tech debt, and open problems
```

---

## Page format

Every wiki page must follow this structure:

```markdown
# [Page Title]

**Type**: architecture | component | decision | concept | dependency | question | issue
**Summary**: One sentence. What is this and why does it matter?
**Tags**: #tag1 #tag2
**Sources**: [[src/path/to/source]], [[src/path/to/other]]
**Related**: [[wiki/components/other-component]], [[wiki/concepts/related-concept]]
**Last Updated**: YYYY-MM-DD

---

## Overview

[2–4 paragraphs. What it is, what problem it solves, how it fits the system.]

## Details

[The meat. Architecture diagrams (Mermaid), key interfaces, data flows, behaviour under load, edge cases.]

## Decisions & Rationale

[Why it was built this way. What alternatives were considered. Link to ADRs.]

## Known Issues / Tech Debt

[Honest assessment of current problems. Don't sugarcoat.]

## Related

[Cross-links to wiki pages that are meaningfully connected.]
```

---

## Workflows

### Ingest a source

When the user adds a file to `src/` and asks you to ingest it:

1. Read the full source.
2. Create a **source summary page** under the most relevant `wiki/` subfolder.
3. Create or update **component pages** for any module, service, or class introduced or modified.
4. Create or update **concept pages** for any domain terms, patterns, or design decisions.
5. Create or update **dependency pages** for any libraries or external integrations mentioned.
6. Run a **backlink sweep**: scan existing wiki pages for mentions of newly created pages and add `[[wikilinks]]` where missing.
7. Update `wiki/index.md` with new pages.
8. Append an entry to `wiki/log.md`:
   ```
   [YYYY-MM-DD] INGEST src/path/to/source → created: [list] | updated: [list]
   ```

### Answer a question

When the user asks a question:

1. Read `wiki/index.md` first.
2. Pull the most relevant wiki pages.
3. Answer using **only what is in the wiki** — never answer from memory alone.
4. Cite specific wiki pages inline: `(→ [[wiki/components/auth-service]])`.
5. If the answer required significant synthesis, offer to file it as a new page under `wiki/questions/`.

### Lint the wiki

When the user asks you to lint or audit the wiki:

- Check for **contradictions** between pages.
- Find **orphan pages** (no inbound links from other pages).
- Identify **concepts mentioned** in pages that lack their own page.
- Flag **stale claims** that may be outdated based on newer sources.
- Check all pages follow the page format above.
- Report findings as a severity-tiered list:
  - 🔴 Error — contradiction or broken link
  - 🟡 Warning — orphan page, missing summary, uncited claim
  - 🔵 Info — suggested new page, missing backlink
- Write the report to `wiki/pages/lint-YYYY-MM-DD.md`.
- Append an entry to `wiki/log.md`.

### Update a page

When the user asks you to update a page after new information arrives:

1. Show a diff of what will change before writing.
2. Always cite the source of new information.
3. Sweep all other pages for the same stale claim and update them too.
4. Log unconditionally to `wiki/log.md`.

---

## Working with this repo

- When adding dependencies, use `cargo add` instead of hand-editing Cargo.toml.

---

## Rules

- **Never modify anything in `src/`**. It is the source of truth. Read-only.
- **Always update `wiki/index.md` and `wiki/log.md`** after any write operation.
- **Every claim on a wiki page must be traceable** to a source in `src/` or another wiki page.
- **Use `[[wikilinks]]`** for all cross-references between wiki pages.
- **Keep page names lowercase with hyphens** — e.g. `auth-service.md`, `rate-limiting.md`.
- **Write in plain, direct language**. No filler. No hedging. No bullet-point soup.
- **When uncertain how to categorise something**, ask the user rather than guessing.
- **Do not invent details** that are not present in the source material.

---

## Index conventions

`wiki/index.md` is a flat table of contents. Format:

```markdown
# Wiki Index

_Last updated: YYYY-MM-DD_

## Architecture

- [[wiki/architecture/system-overview]] — High-level system map
- [[wiki/architecture/data-flow]] — End-to-end request lifecycle

## Components

- [[wiki/components/auth-service]] — Handles authentication and session management
- [[wiki/components/api-gateway]] — Entry point for all external traffic

## Decisions

- [[wiki/decisions/adr-001-database-choice]] — Why PostgreSQL over MongoDB

## Concepts

- [[wiki/concepts/event-sourcing]] — How state changes are recorded
- [[wiki/concepts/rate-limiting]] — Token bucket algorithm used across services

## Dependencies

- [[wiki/dependencies/prisma]] — ORM layer, version 5.x
- [[wiki/dependencies/redis]] — Used for session store and pub/sub

## Questions

- [[wiki/questions/why-no-graphql]] — Decision not to adopt GraphQL

## Issues

- [[wiki/issues/n-plus-one-queries]] — Known ORM performance problem in listing endpoints
```

---

## Bootstrapping this wiki

To initialise from scratch, tell Claude:

> "Read everything in `src/` and build the initial wiki. Start with the architecture overview, then create component pages for each major module. Update index.md when done."

To ingest a single new source:

> "Ingest `src/docs/new-rfc.md` and update the wiki."

To ask a question:

> "Based on the wiki, how does the authentication flow work end to end?"

To lint:

> "Lint the wiki and write a report."
