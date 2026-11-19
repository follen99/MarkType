# MarkType: instructions for coding agents

MarkType is a lightweight, Typora-style WYSIWYG Markdown editor (Tauri 2 + Svelte 5 + ProseMirror/CodeMirror).
The agent owns architecture and code; the user (Italian speaker, not a developer) tests alpha builds.

## Start here

1. Read **[docs/STATUS.md](docs/STATUS.md)**: where the project stands, the next task, environment traps, conventions.
2. Requirements: [docs/SPEC.md](docs/SPEC.md) (agreed with the user, in Italian). Progress: [docs/ROADMAP.md](docs/ROADMAP.md).
3. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Themes contract: [docs/THEMES.md](docs/THEMES.md).

## Rules

- Talk to the user in **Italian**. Docs under `docs/` are in Italian; code, comments and commit messages in English.
- Commit and push to `main` autonomously (Conventional Commits). Update `docs/STATUS.md`, `docs/ROADMAP.md` and
  `CHANGELOG.md` with every milestone.
- Before any PowerShell command that runs node/pnpm/cargo: `. .\scripts\dev-env.ps1` (fixes a broken system PATH).
- Never write code containing backslashes through bash heredocs (they get mangled): use the Write/Edit tools.
- Keep every markdown construct round-trip safe: add fixtures in `packages/editor/test/fixtures/` for new syntax.
- Only `apps/*` (Platform implementations) may touch Tauri or browser file APIs; `packages/*` stay platform-free.
- Definition of done for a milestone: `pnpm check` (0 warnings), JS + Rust tests, clippy `-D warnings`, prettier,
  installer built and launched, commit + push, message to the user with what to test.
