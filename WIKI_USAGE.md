# LLM Wiki — Setup Instructions

## 1. Copy this folder into your project root

```
your-project/
├── CLAUDE.md          ← wiki config (Claude reads this on startup)
├── src/               ← real source code (already exists in this project)
├── docs/              ← drop docs, specs, RFCs, design notes here
└── wiki/              ← Claude writes here, you read here
    ├── index.md
    ├── log.md
    ├── architecture/
    ├── components/
    ├── decisions/
    ├── concepts/
    ├── dependencies/
    ├── questions/
    └── issues/
```

## 2. Create the empty folders

```bash
mkdir -p docs
mkdir -p wiki/{architecture,components,decisions,concepts,dependencies,questions,issues}
```

## 3. Add your source material

`src/` is just your existing code — nothing to set up there.

Drop any of the following into `docs/`:

- READMEs, specs, RFCs, design docs
- PR descriptions, commit messages, changelogs
- Meeting notes, Slack exports, decision logs
- Third-party library docs relevant to your stack

## 4. Bootstrap the wiki

Open Claude Code in your project root and run:

```
Read everything in src/ and docs/ and build the initial wiki.
Start with an architecture overview, then create component pages
for each major module. Update index.md when done.
```

## 5. Day-to-day usage

**Ingest a new source:**

```
Ingest docs/new-rfc.md and update the wiki.
```

**Ask a question:**

```
Based on the wiki, how does the authentication flow work end to end?
```

**Lint the wiki:**

```
Lint the wiki and write a report.
```

## Tips

- Put this folder under git — gives you full history of what Claude changed.
- View wiki pages in Obsidian for a nice graph view (open the wiki/ folder as a vault).
- Never edit wiki pages by hand. If you do, add a `<!-- human-edited -->` comment so Claude knows to review it on the next lint.
- `src/` is your live code, not an immutable snapshot — the wiki should never write to it, but you'll keep editing it normally as you develop.
- Keep `docs/` as your source of truth for design intent.
