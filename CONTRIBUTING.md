# Contributing / Development setup

## Requirements

| Tool | Version | Notes |
|---|---|---|
| [Rust](https://rustup.rs) | stable (via rustup) | On Windows, the MSVC toolchain |
| [Node.js](https://nodejs.org) | current LTS | |
| [pnpm](https://pnpm.io) | 10+ | `corepack enable pnpm`. Node 25+ no longer ships corepack: run `npm i -g corepack` first |
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

## Troubleshooting (Windows)

- **`'node' is not recognized` inside npm/pnpm scripts** while `node` works in PowerShell: an entry of the system
  `Path` contains a stray `"` (e.g. `C:\Program Files\WSL"`), and `cmd.exe` ignores every entry after it. Fix the
  entry (needs admin), or strip quotes in the current shell:
  `$env:Path = $env:Path -replace '"',''`.
- **`os error 1224` while bundling**: the antivirus is scanning the installer; re-run `pnpm tauri build --bundles nsis`.

## Repository layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#struttura-della-repository).

## Conventions

- Commits: [Conventional Commits](https://www.conventionalcommits.org) (`feat(editor): …`, `fix(themes): …`).
- Every Markdown feature needs round-trip fixtures in `packages/editor/test/fixtures/`.
- Platform-specific code goes only in `apps/*`; `packages/*` must not import Tauri APIs directly.
- Update [docs/ROADMAP.md](docs/ROADMAP.md) checkboxes in the same PR as the feature.
