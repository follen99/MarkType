# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added
- Project specification, architecture, roadmap, shortcuts and theme documentation.
- Repository layout.
- pnpm monorepo: shared packages (`platform`, `i18n`, `themes`, `app`), Tauri 2 desktop app, web app skeleton.
- Frameless window with a custom title bar, status bar and light/dark theme following the OS.
- Italian and English UI strings.
- CI (types, formatting, unit tests, clippy on Windows/macOS/Linux) and draft-release workflow.
- Editor (M1): Typora-style seamless WYSIWYG on ProseMirror with Typora-compatible DOM, markdown input
  rules, Typora shortcuts, source mode and split view on CodeMirror 6, GFM tables and task lists,
  front matter / math / HTML / footnotes preserved as source.
- Menus in the title bar, status bar with word count, in-app dialogs.
- Open / Save / Save As with atomic writes, external-change detection, CRLF and BOM preservation;
  untouched files are never reformatted.
