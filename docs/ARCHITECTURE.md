# MarkType: architettura

## Panoramica

```
┌──────────────────────────── apps/desktop (Tauri 2) ───────────────────────────┐
│  Finestra nativa (senza cornice)                                              │
│  ┌──────────────── WebView (WebView2 / WKWebView / WebKitGTK) ──────────────┐ │
│  │  @marktype/app (Svelte 5)                                                │ │
│  │   ├─ titlebar · tabs · sidebar (file/TOC/ricerca) · statusbar · settings │ │
│  │   └─ @marktype/editor (ProseMirror + CodeMirror 6 + unified/remark)      │ │
│  │         └─ renderers on demand: highlight · Mermaid · KaTeX              │ │
│  │  Platform = TauriPlatform ──── invoke() / eventi ────┐                   │ │
│  └──────────────────────────────────────────────────────┼───────────────────┘ │
│  Core Rust (src-tauri)                                  ▼                     │
│   fs (lettura/scrittura atomica, albero, cestino) · images (salvataggio senza │
│   conflitti) · search (ripgrep-like) · watch (temi) · recovery (bozze) ·      │
│   settings · export (PDF/Pandoc) · single-instance · CLI · associazioni file │
└───────────────────────────────────────────────────────────────────────────────┘

apps/web (GitHub Pages) = stesso @marktype/app con Platform = WebPlatform
```

Principio guida: **tutta la UI è indipendente dalla piattaforma**. L'unico punto di contatto con il sistema
è l'interfaccia `Platform` (`packages/platform`), che ha due implementazioni: `TauriPlatform` (desktop, e in futuro
mobile) e `WebPlatform` (browser). Aggiungere il mobile significa riusare `TauriPlatform` e rendere la UI responsive.

## Scelte tecnologiche e motivazioni

| Area | Scelta | Perché |
|---|---|---|
| Shell nativa | **Tauri 2** | Installer ~5-10 MB contro gli 80+ di Electron; Rust per l'I/O; supporto mobile. |
| UI framework | **Svelte 5** + TypeScript + Vite | Compila in JS minimale senza runtime pesante; reattività semplice. |
| Editor WYSIWYG | **ProseMirror** (schema proprio) | Base solida per il WYSIWYG; schema e DOM controllati da noi, quindi possiamo emettere le classi Typora. Normalizzazione al salvataggio accettata (SPEC §5). |
| Parsing/serializzazione | **unified / remark** (`remark-gfm`, `remark-math`, `remark-frontmatter`, plugin propri) ↔ ProseMirror | mdast è un AST standard e ben testato; un ponte mdast↔ProseMirror proprio dà controllo totale. |
| Sorgente / split / blocchi codice | **CodeMirror 6** | Leggero e modulare, linguaggi lazy. I token usano classi stile CodeMirror 5 (`cm-keyword`, …) dentro `.cm-s-inner` per la compatibilità con i temi Typora. |
| Sintassi "al cursore" | plugin ProseMirror con decorazioni | Mostra i marcatori (`.md-meta`) dell'elemento inline sotto il cursore e aggiunge `.md-focus` al blocco attivo. |
| Diagrammi | **Mermaid** (import dinamico) | Caricato solo se il documento contiene un blocco mermaid. |
| Matematica | **KaTeX** (import dinamico) | Veloce, senza dipendenze esterne. |
| HTML → MD | `rehype-parse` + `rehype-remark` | Riusa la pipeline unified. |
| HTML sanitize | `rehype-sanitize` / DOMPurify | L'HTML inline non deve poter eseguire script. |
| Ricerca in cartella | crate `ignore` + `grep-searcher` (librerie di ripgrep) | Velocissima, rispetta `.gitignore`. |
| Cestino | crate `trash` | Cestino nativo su tutti gli OS. |
| Istanza singola / CLI | `tauri-plugin-single-instance`, `tauri-plugin-cli` | Standard Tauri. |
| Dialog / fs sandbox | `tauri-plugin-dialog` + comandi Rust propri | Scrittura atomica e controllo dell'mtime in Rust. |
| Zip (web) | `fflate` | ~8 KB, veloce. |
| Gestore pacchetti JS | **pnpm** (workspace) | Monorepo con pacchetti condivisi. |
| Test | Vitest (TS), `cargo test` (Rust), Playwright (e2e sul build web) | Il round-trip md→PM→md ha una suite di fixture dedicata. |

### Compatibilità con i temi Typora

Il DOM replica la struttura di Typora (vedi [THEMES.md](THEMES.md)):

```html
<body class="os-windows">          ← os-windows | os-macos | os-linux, come Typora
  <header id="mt-titlebar">…</header>
  <div id="typora-sidebar"> … .sidebar-tabs · #file-library-tree .file-tree-node · #outline-content .outline-item … </div>
  <content>
    <div id="write" class="is-node">   ← root ProseMirror (contenteditable)
      <h1 class="md-end-block md-heading md-focus">…</h1>
      <pre class="md-fences md-end-block" lang="js"><div class="CodeMirror cm-s-inner">…</div></pre>
      …
    </div>
  </content>
  <footer id="mt-statusbar">…</footer>
</body>
```

Ordine di caricamento dei CSS: `base.css` (MarkType) → `<tema>.css` → `base.user.css` → `<tema>.user.css`.

### Lazy loading e prestazioni

- Bundle iniziale target < 400 KB gzip (shell, ProseMirror, CodeMirror core, remark).
- Mermaid, KaTeX e i linguaggi CodeMirror sono chunk separati caricati alla prima occorrenza.
- Il rendering dei blocchi Mermaid/KaTeX fuori dallo schermo è differito (`IntersectionObserver`).
- Il parsing di documenti grandi avviene in un Web Worker; la TOC e le statistiche si aggiornano con debounce.
- Rust: build release con `lto = true`, `codegen-units = 1`, `opt-level = "s"`, `strip = true`, `panic = "abort"`.

## Struttura della repository

```
MarkType/
├─ apps/
│  ├─ desktop/                 # shell Tauri 2 (in futuro anche target Android/iOS)
│  │  ├─ src/                  # bootstrap frontend + TauriPlatform
│  │  ├─ src-tauri/
│  │  │  ├─ src/
│  │  │  │  ├─ main.rs / lib.rs
│  │  │  │  └─ commands/       # fs, images, search, recovery, settings, export, themes
│  │  │  ├─ capabilities/      # permessi Tauri
│  │  │  ├─ icons/
│  │  │  ├─ windows/           # hook NSIS (menu contestuale, associazioni)
│  │  │  ├─ Cargo.toml
│  │  │  └─ tauri.conf.json
│  │  └─ package.json
│  └─ web/                     # build per GitHub Pages + WebPlatform
├─ packages/
│  ├─ app/                     # UI condivisa (Svelte): layout, tabs, sidebar, titlebar, statusbar, settings
│  ├─ editor/                  # schema PM, ponte mdast↔PM, input rules, keymap, node views, modalità sorgente/split
│  ├─ renderers/               # highlight, Mermaid, KaTeX (lazy)
│  ├─ platform/                # interfaccia Platform + tipi condivisi
│  ├─ themes/                  # base.css + temi inclusi (light, dark, paper, formal-dark-pro)
│  └─ i18n/                    # it.json, en.json, mini runtime
├─ docs/                       # SPEC, ARCHITECTURE, ROADMAP, THEMES, SHORTCUTS
├─ .github/workflows/          # ci.yml, release.yml, pages.yml
├─ Cargo.toml                  # workspace Rust
├─ package.json · pnpm-workspace.yaml
├─ LICENSE (GPL-3.0) · README.md · CONTRIBUTING.md · CHANGELOG.md
```

## Interfaccia Platform (bozza)

```ts
export interface Platform {
  readonly kind: 'desktop' | 'web' | 'mobile';
  readonly capabilities: { folders: boolean; search: boolean; pandoc: boolean; trash: boolean };

  // file
  openFileDialog(opts?: OpenOptions): Promise<FileRef[] | null>;
  openFolderDialog(): Promise<FolderRef | null>;
  readTextFile(ref: FileRef): Promise<{ text: string; meta: FileMeta }>;
  writeTextFile(ref: FileRef, text: string, expected?: FileMeta): Promise<WriteResult>; // 'ok' | 'conflict'
  saveAsDialog(suggestedName: string): Promise<FileRef | null>;
  listTree(folder: FolderRef): Promise<TreeNode>;
  createFile / createFolder / rename / move / trash(...)

  // immagini
  saveImage(doc: FileRef | null, data: Uint8Array, mime: string, originalName?: string): Promise<string /* rel path */>;
  resolveAssetUrl(doc: FileRef | null, src: string): string;

  // varie
  searchFolder(folder: FolderRef, query: SearchQuery, onHit: (hit: SearchHit) => void): Cancelable;
  loadSettings(): Promise<Settings>; saveSettings(s: Settings): Promise<void>;
  listThemes(): Promise<ThemeInfo[]>; readTheme(id: string): Promise<string>; onThemeChanged(cb): Unsubscribe;
  saveDraft(id: string, text: string): Promise<void>; listDrafts(): Promise<Draft[]>;
  exportPdf(html: string, opts: PdfOptions): Promise<void>;
  runPandoc?(input: string, format: string, out: FileRef): Promise<void>;
  onOpenRequest(cb: (paths: string[]) => void): Unsubscribe; // istanza singola / CLI / associazione file
  window: { minimize(); toggleMaximize(); close(); setTitle(t: string); startDrag() };
}
```

## Rischi tecnici noti

| Rischio | Mitigazione |
|---|---|
| **Export PDF multipiattaforma**: Tauri non espone un `printToPDF` uniforme. | v1: API nativa dove disponibile (WebView2 `PrintToPdfAsync` su Windows, `WKWebView.createPDF` su macOS), fallback `window.print()` (dialog con "Salva come PDF") su Linux. |
| Differenze di rendering tra webview (WebKitGTK su Linux è la più indietro). | CI con test e2e sul build web su Chromium e WebKit; niente CSS troppo recente senza fallback. |
| Compatibilità al 100% con i temi Typora. | Obiettivo realistico: editor, sidebar e TOC fedeli; menu/dialog di Typora non esistono. Suite di screenshot con 3-4 temi popolari. |
| Seamless editing su elementi complessi (tabelle, math inline, HTML). | Node view dedicate; per l'HTML grezzo l'editing avviene in sorgente dentro il blocco. |
| Installer non firmati. | Istruzioni chiare nel README; pipeline pronta per la firma. |
