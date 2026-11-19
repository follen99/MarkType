# apps/desktop

Tauri 2 shell for Windows, macOS and Linux (later also Android/iOS).

- `src/`: frontend bootstrap. Mounts `@marktype/app` with `TauriPlatform`, the implementation of the `Platform` interface over Tauri `invoke()`.
- `src-tauri/`: Rust core, made of commands (`fs`, `images`, `search`, `recovery`, `settings`, `themes`, `export`), plugins (single-instance, cli, dialog), bundle config and NSIS hooks for the Windows context menu and file associations.
