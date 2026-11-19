# MarkType

**A lightweight, Typora-style WYSIWYG Markdown editor for Windows, macOS and Linux.**
*Un editor Markdown WYSIWYG leggero, in stile Typora, per Windows, macOS e Linux.*

> 🚧 **Status: in development (pre-alpha).** Nothing is ready to download yet. Progress: [docs/ROADMAP.md](docs/ROADMAP.md).

## Features (planned for v1.0)

- **Seamless editing**: you write Markdown and see it rendered; the syntax shows up only where the cursor is.
  Source mode (`Ctrl+/`) and split view are also available.
- **Typora shortcuts**: `Ctrl+B`, `Ctrl+1…6`, `Ctrl+Shift+K` and the rest, all customizable.
- **Folders**: file tree, document outline (TOC), tabs, quick open (`Ctrl+P`), search in folder, file management.
- **Typora-compatible themes**: drop a Typora `.css` theme into the themes folder and it works. Live reload and user CSS overrides.
- **Paste images** with `Ctrl+V`: they are saved to `./assets` (configurable) and never overwrite an existing file.
- **Rich rendering**: syntax highlighting, Mermaid, KaTeX math, GFM tables and task lists, footnotes, front matter, `[toc]`, GitHub alerts.
- **Export** to PDF, HTML and (with Pandoc) DOCX, ODT, EPUB, LaTeX…
- **Lightweight**: installer under 15 MB, startup under 1 s (built with [Tauri 2](https://tauri.app) and Rust).
- A **web version** on GitHub Pages will follow.

## Installation

Installers will be published on [GitHub Releases](https://github.com/follen99/MarkType/releases)
(`.exe`/`.msi` for Windows, `.dmg` for macOS, `.AppImage`/`.deb`/`.rpm` for Linux).

The builds are not code-signed yet:
- **Windows**: if SmartScreen appears, click *More info → Run anyway*.
- **macOS**: right-click the app → *Open* → *Open* (only the first time), or run `xattr -dr com.apple.quarantine /Applications/MarkType.app`.

## Documentation

| Doc | Content |
|---|---|
| [SPEC.md](docs/SPEC.md) | Functional specification (Italian) |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture and tech choices |
| [ROADMAP.md](docs/ROADMAP.md) | Milestones and progress |
| [SHORTCUTS.md](docs/SHORTCUTS.md) | Keyboard shortcuts |
| [THEMES.md](docs/THEMES.md) | Theme format and Typora compatibility |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup |

## License

[GPL-3.0](LICENSE). The bundled *Formal Dark Pro* theme is MIT-licensed; see `packages/themes/builtin/formal-dark-pro/`.

MarkType is an independent project, not affiliated with Typora.
