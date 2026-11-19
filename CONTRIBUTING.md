# Contributing / Development setup

## Requirements

| Tool | Version | Notes |
|---|---|---|
| [Rust](https://rustup.rs) | stable (via rustup) | On Windows, the MSVC toolchain |
| [Node.js](https://nodejs.org) | current LTS | |
| [pnpm](https://pnpm.io) | 9+ | `corepack enable` |
| Tauri prerequisites | | [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/): Windows needs *Visual Studio Build Tools* (C++ workload) and WebView2 (already in Windows 11); Linux needs `webkit2gtk-4.1` and related packages |

## Commands

```bash
pnpm install              # install JS dependencies
pnpm dev                  # run the desktop app in dev mode (hot reload)
pnpm dev:web              # run the web build in the browser
pnpm test                 # TS unit tests (Vitest) + cargo test
pnpm lint                 # eslint + prettier + clippy
pnpm build                # release build of the desktop app (installers in target/release/bundle)
pnpm build:web            # static build for GitHub Pages
```

## Repository layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#struttura-della-repository).

## Conventions

- Commits: [Conventional Commits](https://www.conventionalcommits.org) (`feat(editor): …`, `fix(themes): …`).
- Every Markdown feature needs round-trip fixtures in `packages/editor/test/fixtures/`.
- Platform-specific code goes only in `apps/*`; `packages/*` must not import Tauri APIs directly.
- Update [docs/ROADMAP.md](docs/ROADMAP.md) checkboxes in the same PR as the feature.
