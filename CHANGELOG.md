# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning: [SemVer](https://semver.org).

## [Unreleased]

## [0.6.0] - 2026-11-19 (beta 1)

### Added
- Settings in `settings.json` (`%APPDATA%\MarkType`, `~/Library/Application Support/MarkType`,
  `~/.config/marktype`), editable by hand. The preferences of earlier versions move there on the first start.
  A broken file is reported and never overwritten.
- Settings panel (File → Settings…, `Ctrl+,`): language, autosave, reopen the last folder, font size, page
  width, image options (destination, custom folder, file names, ask for the name), export options, and buttons
  to open `settings.json`, `keybindings.json` and the themes folder.
- Custom shortcuts in `keybindings.json` (`"bold": "Mod+Shift+B"`, a list, or `null`); command names in
  docs/SHORTCUTS.md.
- Export (File menu): standalone HTML with the theme CSS inside (images relative to the HTML file or embedded,
  theme fonts embedded, headings with anchors and working `[toc]` links); PDF through the print dialog
  ("Save as PDF"); Word, OpenDocument, RTF, EPUB and LaTeX through Pandoc when it is installed (its path can
  be set in Settings).
- Command line: `marktype file.md`, `marktype ./folder`.
- Single instance: opening a file while MarkType runs opens it in a tab of the existing window.
- Windows installer: `.md`/`.markdown` file association and "Open with MarkType" in the Explorer context menu
  of folders, folder backgrounds and Markdown files. macOS: files opened from the Finder.
- Web version: HTML and PDF export (the HTML file is downloaded, images embedded).

## [0.5.0] - 2026-11-19 (alpha 5)

### Added
- Images (M5): `Ctrl+V` of a screenshot or copied image, drag & drop from the file manager and
  Format → "Insert Image from File…" copy the image next to the document and insert `![name](assets/name.png)`.
- Destinations: `./assets` (default), `./${filename}.assets`, a custom folder (relative or absolute) or no copy,
  from the Format menu; the front matter key `typora-copy-images-to` overrides them per document.
- File names from a pattern (default `${filename}-${timestamp}`; tokens `${filename}`, `${date}`, `${time}`,
  `${timestamp}`, `${hash}`, `${original}`), optionally asking for the name each time. A taken name gets
  `-1`, `-2`…: an existing file is never overwritten.
- Images pasted in a document that was never saved wait in a temporary folder and move to their destination
  on the first save, with the paths in the text rewritten.
- Paste from web pages, Word and other programs: HTML becomes Markdown (headings, lists, links, tables, code,
  images). Copies inside MarkType and pastes inside code blocks are unchanged.
- Markdown files dropped on the window open in a tab.
- Web version: pasted and dropped images are shown for the session (not saved yet).

### Changed
- Image paths are decoded with `decodeURIComponent`, so `%23` (`#`) and similar escapes resolve to the file.

## [0.4.0] - 2026-11-19 (alpha 4)

### Added
- Themes (M4): Typora themes from the user themes folder (`%APPDATA%\MarkType\themes` and equivalents), with
  `base.user.css` / `<theme>.user.css` overrides, relative `url()` assets and live reload on every change.
- Themes menu: light and dark groups, "Follow System Theme" (one light and one dark theme), fixed theme,
  "Open Themes Folder". The choice is remembered.
- Built-in themes: Light, Paper (new, sepia and serif), Dark, Formal Dark Pro.
- Default syntax colours for themes that do not style code tokens; diagrams and math re-render with the new theme.
- `scripts/smoke-desktop.mjs`: end-to-end check of the built desktop app through the WebView2 debugging port.

### Changed
- Title bar, menus, tabs and status bar keep the UI font when a theme changes the `body` font.

## [0.3.0] - 2026-11-19 (alpha 3)

First public pre-release: installers for Windows, macOS and Linux, and the web version on GitHub Pages.

### Added
- Release pipeline: a `v*` tag builds the installers on every OS into one draft release;
  `v0.x` tags are marked as pre-releases. The web version is deployed to GitHub Pages from `main`.
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
- Folders and sidebar (M2): file tree with create / rename / drag-and-drop move / move to trash,
  outline with the current heading highlighted, search in folder (respects .gitignore).
- Tabs, Quick Open (`Ctrl+P`, fuzzy), find & replace in every mode, optional auto save,
  recovery of unsaved changes after a crash, Ctrl+click on links to local markdown files.
- The mode label in the status bar cycles visual → source → split.
- Shortcuts follow the keyboard layout (e.g. `Ctrl+-` / `Ctrl++` on the Italian layout).
- Rendering (M3): syntax highlighting for 100+ languages (loaded on demand) with an editable
  language label, Mermaid diagrams, KaTeX math (inline and blocks), sanitized HTML blocks,
  `[toc]`, `==highlight==`, emoji shortcodes, inline HTML tags as formatting, styled footnotes,
  colored GitHub alerts, table toolbar and `| a | b |` + Enter to create tables.
