# MarkType: stato del progetto e passaggio di consegne

> **Leggere per primo all'inizio di ogni sessione.** Aggiornare alla fine di ogni blocco di lavoro (insieme a
> [ROADMAP.md](ROADMAP.md) e [CHANGELOG.md](../CHANGELOG.md)).
>
> Ultimo aggiornamento: **2026-11-19**, dopo la release `v0.6.0` (beta 1, export e integrazione con il sistema).

## 1. Dove siamo

| Milestone | Stato | Commit | Testata dall'utente |
|---|---|---|---|
| M0 Fondamenta (monorepo, Tauri, CI) | ✅ completata | `4a677c9` | sì |
| M1 Nucleo editor → alpha 1 | ✅ completata | `9a1ef18` | sì, "funziona tutto" |
| M2 Cartelle, schede, sidebar → alpha 2 | ✅ completata | `8288b22` | sì, "funziona tutto bene" |
| M3 Rendering avanzato → alpha 3 | ✅ completata, rilasciata come `v0.3.0` | `c8efd1f` | **no, in attesa di test** |
| M4 Temi → alpha 4 | ✅ completata, rilasciata come `v0.4.0` | branch `m4-themes` | **no, in attesa di test** |
| M5 Immagini e appunti → alpha 5 | ✅ completata, rilasciata come `v0.5.0` | branch `m5-images` | **no, in attesa di test** |
| M6 Export e integrazione OS → beta | ✅ completata, rilasciata come `v0.6.0` | branch `m6-export-os` | **no, in attesa di test** |
| M7 Rifinitura → v1.0 | ⏭️ **prossima** | | |
| Fase 2: versione web (GitHub Pages) | online su https://follen99.github.io/MarkType/ (apri/salva file singolo); resto da fare | | |

Dettaglio di ogni voce (fatto/da fare) in [ROADMAP.md](ROADMAP.md); requisiti concordati in [SPEC.md](SPEC.md).

**Modalità automatica (richiesta dall'utente il 2026-11-19):** un branch per milestone (`m5-images`…), merge su
`main` solo con tutto verde (check, test, clippy, prettier, build installer, `scripts/smoke-desktop.mjs`), una
release `vX.Y.0` per milestone. Fermarsi prima che il contesto superi il 50% o che finisca la finestra di 5 ore.

### Ultima build (Windows 11, release)
- Installer NSIS: **4,58 MB** (target < 15 MB).
- RAM a vuoto (M0): ~206 MB privati, quasi tutti WebView2 → **sopra il target di 150 MB**, da ottimizzare in M7.
- Bundle JS iniziale ~330 KB gzip; Mermaid, KaTeX, linguaggi di highlight, DOMPurify e gemoji sono chunk lazy.

### Come sono fatti i temi (M4)
- Rust `commands/themes.rs`: `list_themes`, `watch_themes` (evento `themes-changed`), `open_themes_folder`,
  `user_config_dir()` = `%APPDATA%\MarkType` / `~/Library/Application Support/MarkType` / `~/.config/marktype`
  (riusarla per `settings.json` in M6; **non** `app_config_dir`, che usa l'identificativo del bundle).
- `apps/desktop/src/platform/tauri.ts` `assetUrlWithDirs()`: URL del protocollo asset con le `/` visibili, così gli
  `url()` relativi dei temi funzionano (`convertFileSrc` codifica anche i separatori).
- `packages/app/src/theme.svelte.ts` `ThemeManager`: tre `<link>` (`mt-theme`, `mt-theme-base-user`,
  `mt-theme-user`) tenuti in fondo a `<head>` (i CSS lazy vengono spostati prima); classe `mt-theme-dark` su `<html>`
  e `color-scheme`; al `load` del tema chiama `refreshPreviews()` dell'editor (Mermaid ridisegnato).
- Colori dei token predefiniti in `base.css` (variante scura con `:where(.mt-theme-dark)`, stessa specificità).
- Menu dinamici: `MenuSlot` in `registry.ts`, `slotItems`/`isVisible` in `MenuBar.svelte`.

### Come sono fatte le immagini (M5)
- Rust `commands/images.rs`: `save_image` (corpo = byte grezzi, header `x-dir`/`x-name` codificati con
  `encodeURIComponent`), `move_image`, `read_image_file`, `pending_images_root`, `discard_pending_images`.
  `create_free_file` crea il file con `create_new` (`nome.png`, `nome-1.png`…): **mai sovrascrivere**, nemmeno in
  caso di corsa con un altro programma. Ogni cartella usata viene aggiunta allo scope del protocollo asset.
- `packages/app/src/images.ts` (funzioni pure, testate in `test/images.test.ts`): impostazioni (`prefs` chiave
  `images`), pattern dei nomi, `typora-copy-images-to`, cartella di destinazione, `src` relativo con `/` e
  `%20`. `DocumentController.storeImage()` usa tutto questo; `relocatePendingImages()` prima di ogni scrittura
  sposta le immagini ancora nella cartella temporanea (`app_data_dir/pending-images/<id doc>`) e riscrive i
  percorsi (`EditorHost.replaceImageSources`, mantiene l'annulla).
- Editor: `wysiwyg/clipboard.ts` (ProseMirror `handlePaste`/`handleDrop`), `source/view.ts` `imageHandlers`
  (CodeMirror), `markdown/html.ts` (HTML → Markdown con `rehype-parse` + `rehype-remark`, chunk lazy). Se negli
  appunti c'è HTML con testo vince l'HTML, altrimenti i file immagine; le copie interne (`data-pm-slice`) e gli
  incolla nei blocchi di codice restano quelli di ProseMirror.
- Trascinamento dall'Esplora risorse: su desktop Tauri intercetta i drop del sistema (con i percorsi), quindi
  arrivano da `platform.window.onFileDrop` (App.svelte: immagini nel documento, `.md` aperti in una scheda).
  Il drag & drop HTML5 interno (sidebar, immagini dentro l'editor) continua a funzionare.
- "Nessuna copia" vale per i file con un percorso (inserisci da file, trascinamento); un'immagine incollata non
  ha un file d'origine e va comunque in `./assets`.
- Web: `platform.images = null`, le immagini incollate sono URL `blob:` validi solo nella sessione.

### Come sono fatti impostazioni, avvio ed export (M6)
- **`settings.json`**: Rust `commands/settings.rs` (`load_settings`, `update_settings` = legge il file, applica solo
  le chiavi cambiate, scrive atomico; `null` toglie la chiave; un file non valido non viene mai riscritto).
  Il frontend tiene i valori in memoria (`memoryPrefs` in `packages/platform`, scritture a lotti ogni 150 ms e
  `flush` alla chiusura). Al primo avvio `apps/desktop/src/platform/tauri.ts` copia le vecchie chiavi
  `marktype.*` di localStorage e mette il flag `marktype.migratedToSettingsJson`. Le chiavi sono quelle di prima
  (`theme`, `images`, `sidebar.*`, `autosave`, `mode`, `lastFolder`, `recentFiles`) più `language`,
  `restoreFolder`, `editor` (`fontSize`, `pageWidth`), `export` (`embedImages`, `pandocPath`):
  `packages/app/src/settings.svelte.ts` (`AppSettings`). Le modifiche a mano valgono al riavvio.
- **`keybindings.json`**: letto all'avvio (`read_keybindings`), `parseUserKeybindings`/`effectiveKeybindings` in
  `registry.ts`; nomi dei comandi in [SHORTCUTS.md](SHORTCUTS.md).
- `MARKTYPE_CONFIG_DIR` sostituisce la cartella di configurazione (lo usa lo smoke test).
- **Avvio**: Rust `commands/launch.rs` (`take_launch_paths` per gli argomenti iniziali, evento `open-paths` per
  la seconda istanza via `tauri-plugin-single-instance` e per `RunEvent::Opened` su macOS). App.svelte apre i
  file in schede e le cartelle nella sidebar; con argomenti non riapre l'ultima cartella.
- **Installer**: `bundle.fileAssociations` (md, markdown, mdown, mkd) e `windows/hooks.nsh` (menu contestuale
  "Apri con MarkType" su cartelle, sfondo cartella, file .md/.markdown, in HKCU; etichetta italiana se Windows è
  in italiano). L'MSI ha l'associazione ma non il menu contestuale.
- **Export**: `packages/editor/src/export.ts` `renderHtml` crea una vista ProseMirror non modificabile fuori
  schermo, aspetta che Mermaid/KaTeX/evidenziazione abbiano finito (MutationObserver), clona `#write` e toglie
  l'interfaccia di modifica. `packages/app/src/export.ts` (chunk lazy) compone la pagina: `base.css` +
  `editor.css` (`?raw`) + CSS del tema letto con `fetch` (la CSP ora permette `connect-src 'self' asset:`),
  `url()` relativi dei temi incorporati come data URI, KaTeX da CDN jsDelivr. PDF = la stessa pagina in un
  iframe nascosto + `print()` (dialog di sistema, "Salva come PDF"). Pandoc: Rust `commands/export.rs`
  (markdown su stdin, `--resource-path` = cartella del documento, nessuna finestra console). `open_export`
  apre solo file con estensioni di export.

## 2. Prossimo passo: M7 Rifinitura → v1.0

Obiettivo: [ROADMAP.md](ROADMAP.md), sezione M7. In ordine:
1. Aspettare il feedback dell'utente su M3–M6 e correggere i problemi trovati.
2. Prestazioni: RAM di WebView2, CodeMirror caricato solo in modalità sorgente, avvio < 1 s, documenti da 10k righe.
3. PDF diretto senza dialog (WebView2 `PrintToPdf` via `webview2-com`, `WKWebView.createPDF`), header/footer.
4. Accessibilità di base, menu nativo su macOS, README con screenshot, release `v1.0.0`.

## 3. Mappa del codice

```
apps/desktop/src/platform/tauri.ts   Platform su Tauri (invoke dei comandi Rust, dialog, opener, prefs = localStorage)
apps/desktop/src-tauri/src/commands/ app.rs · fs.rs (lettura UTF-8, scrittura atomica, stamp mtime+size, conflitti)
                                     folder.rs (lista cartelle, crea/rinomina/sposta/cestino) · search.rs (ricerca)
                                     drafts.rs (bozze per il recupero crash, in app_data_dir/drafts)
                                     themes.rs · images.rs · settings.rs · launch.rs (CLI, istanza singola) · export.rs (Pandoc)
apps/desktop/src-tauri/windows/hooks.nsh  menu contestuale "Apri con MarkType" (installer NSIS)
apps/desktop/src-tauri/tauri.conf.json  finestra senza cornice (macOS: tauri.macos.conf.json con overlay), CSP, asset protocol
apps/web/src/platform/web.ts         Platform nel browser (file singolo, File System Access, bozze in localStorage)
packages/platform/src/index.ts       interfaccia Platform (UNICO confine con l'OS) + paths.ts
packages/editor/src/
  host.ts                            EditorHost: modalità wysiwyg/source/split, dirty, outline, find, revealLine
  schema.ts                          schema ProseMirror con DOM compatibile Typora
  markdown/parse.ts · serialize.ts   ponte mdast ↔ ProseMirror (remark: gfm, frontmatter, math)
  wysiwyg/                           seamless.ts (marcatori al cursore, .md-focus), inputrules.ts, keymap.ts, commands.ts, view.ts
  render/                            highlight.ts, blocks.ts (code/mermaid/math/html), inline.ts (math/emoji), table.ts, toc.ts, lazy.ts
  source/view.ts                     CodeMirror 6 + comandi in modalità sorgente
  find.ts                            cerca/sostituisci per entrambi i motori
packages/app/src/
  App.svelte                         composizione, comandi (run), scorciatoie, avvio (file da CLI, ultima cartella, bozze)
  settings.svelte.ts · export.ts     impostazioni dell'app (lingua, layout, export) · export HTML/PDF/Pandoc (lazy)
  chrome/SettingsDialog.svelte       pannello impostazioni (Ctrl+,)
  workspace.svelte.ts                schede, cartella, recenti, modalità, autosave
  document.svelte.ts                 un documento: load/save, BOM/CRLF, conflitti, bozze, autosave
  commands/registry.ts · keys.ts     comandi, scorciatoie Typora, menu; matching scorciatoie per layout
  sidebar/ chrome/ ui/               sidebar (file, indice, ricerca), barra titolo/menu/schede/stato, dialog, quick open, find bar
packages/themes/                     base.css (variabili Typora + layout), chrome.css (sidebar, schede…), builtin/
packages/i18n/src/locales/           it.json, en.json (stesse chiavi: c'è un test)
samples/showcase.md                  documento con tutte le funzioni (test: round-trip identico)
```

## 4. Decisioni e invarianti da rispettare

- **Il testo del file è il riferimento.** `EditorHost` conserva `cleanSource`: un file aperto e non modificato non viene
  mai ri-serializzato (Salva riscrive il testo originale); la modalità sorgente mostra il file com'è. La
  normalizzazione avviene solo dopo una modifica in modalità visuale (accettata dall'utente, SPEC §5).
- **Ogni sintassi non gestita resta verbatim** (`raw_block` / mark `raw`), mai persa al salvataggio. Ogni nuova
  sintassi richiede fixture in `packages/editor/test/fixtures/canonical/` (round-trip byte per byte).
- **DOM compatibile Typora** (`#write`, `md-*`, `cm-s-inner` + classi token CM5). Nelle node view usare
  `classList`, mai assegnare `className`: cancellerebbe le classi di decorazione (`md-focus`) di ProseMirror.
- **Scorciatoie**: si confronta prima il carattere digitato, poi il tasto fisico US, poi il carattere senza Shift
  (`shortcutCandidates` in `keys.ts`). Così `Ctrl+-`/`Ctrl++` funzionano sulla tastiera italiana. Test in
  `packages/app/test/keys.test.ts`. AltGr è ignorato.
- **Solo `packages/platform` tocca l'OS**: i pacchetti in `packages/*` non importano API Tauri.
- **Lazy loading** per ogni libreria pesante (`render/lazy.ts`, `@codemirror/language-data`).
- **Scrittura sicura**: scrittura atomica (tmp + rename) e controllo dello stamp prima di scrivere; mai sovrascrivere
  file senza conferma (vale anche per le immagini in M5).
- Preferenze in `platform.prefs`: `settings.json` su desktop, localStorage sul web. Lettura sincrona, `set(chiave,
  null)` toglie la chiave.

## 5. Ambiente di sviluppo e trappole note (Windows)

- Strumenti installati: Rust 1.100 (MSVC), VS Build Tools 2022, Node 26 LTS, pnpm 12 (via `npm i -g corepack` +
  `corepack enable pnpm`). TypeScript **fissato a 6.x** perché `svelte-check` non supporta ancora TS 7.
- **In ogni comando PowerShell** eseguire prima `. .\scripts\dev-env.ps1` (dalla radice della repo): ricarica il PATH
  e rimuove l'apice spurio di `C:\Program Files\WSL"` presente nel PATH di sistema (l'utente non ha diritti di admin
  per correggerlo). Senza questo, gli script npm/pnpm falliscono con `'node' is not recognized`.
- **Non usare heredoc bash per scrivere codice con backslash** (`\\` diventa `\`): ha già rotto `paths.ts` e
  `registry.ts`. Usare gli strumenti Write/Edit.
- **Errore `os error 1224` durante il bundle**: è l'antivirus che blocca l'installer; rilanciare
  `pnpm --filter @marktype/desktop tauri build --bundles nsis` (il codice è già compilato).
- `gh` non è installato: lo stato della CI su GitHub non è mai stato verificato da qui.
- Il remoto è `https://github.com/follen99/MarkType`, branch `main`. L'utente autorizza commit e push autonomi.

### Comandi
```powershell
. .\scripts\dev-env.ps1
pnpm check                                   # type-check (tsc + svelte-check, 0 warning)
pnpm -r --if-present test                    # test JS (Vitest)
cargo test --workspace                       # test Rust
cargo clippy --workspace --all-targets -- -D warnings
pnpm exec prettier --write . ; cargo fmt --all
pnpm build:web                               # build web (apps/web/dist)
pnpm --filter @marktype/desktop tauri build --bundles nsis   # installer in target/release/bundle/nsis
node scripts/smoke-desktop.mjs               # dopo la build: test end-to-end dell'app vera (temi, immagini, settings, CLI)
```

### Rilasci (GitHub Releases + GitHub Pages)
1. Aggiornare la versione **ovunque** (la release fallisce se il tag non coincide con `Cargo.toml`):
   `Cargo.toml` (`[workspace.package]`), ogni `package.json` di `apps/*` e `packages/*`, poi `cargo check`
   per aggiornare `Cargo.lock`. Spostare le voci di `[Unreleased]` del CHANGELOG in una sezione `[x.y.z]`.
   Versioni solo numeriche (`0.4.0`): il `.msi` di Windows rifiuta suffissi come `-alpha.4`.
2. Commit + push su `main`, poi `git tag -a vX.Y.Z -m "..."` e `git push origin vX.Y.Z`.
   **Mai** concatenare commit e tag nello stesso comando PowerShell: se il commit fallisce il tag finisce sul commit
   sbagliato (è successo; il messaggio di commit va passato con `git commit -F file`).
3. Il tag avvia `release.yml`: crea la bozza, poi compila gli installer Windows/macOS/Linux in parallelo e li
   allega; i tag `v0.x` sono pre-release. La versione web invece la pubblica `pages.yml` a **ogni push su `main`**
   (https://follen99.github.io/MarkType/; si può lanciare anche a mano da Actions): l'ambiente `github-pages`
   rifiuta i deploy dai tag, quindi la web segue `main`, non le release.
4. L'utente apre la bozza in https://github.com/follen99/MarkType/releases e preme **Publish release**
   (`gh` non è installato, le bozze non sono visibili dall'API senza autenticazione).
5. Stato delle run senza `gh`: `curl -s https://api.github.com/repos/follen99/MarkType/actions/runs?per_page=5`.
6. La build web di produzione si prova in locale con il server `web-dist` di `.claude/launch.json`
   (`vite preview`, `http://localhost:4173/MarkType/`), dopo `pnpm build:web`.

### Provare l'interfaccia senza build Rust
Il file `.claude/launch.json` nella cartella **padre** (`Desktop/marktype/`) definisce il server `web`
(Vite su `http://localhost:5173/MarkType/`). Con il browser integrato: `preview_start` → `navigate` a `/MarkType/`.
Se il pannello non è in primo piano i clic falliscono: usare JavaScript. Per caricare il file di esempio:
passare in sorgente (clic su `.mt-status-mode`), poi `fetch('/MarkType/@fs/C:/Users/g.ranauro/Desktop/marktype/MarkType/samples/showcase.md')`
e incollarlo con `cm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }))` su `.cm-content`.
L'hot reload ricarica la pagina e il documento si perde (compare il dialog di recupero bozze: è corretto).
Le funzioni su cartelle e file nativi si provano solo nell'app desktop (le prova l'utente).

## 6. Debito tecnico e cose rimandate

| Voce | Dove/quando |
|---|---|
| RAM WebView2 ~206 MB (target 150) | M7: argomenti WebView2, `MemoryUsageTargetLevel` |
| CodeMirror caricato subito anche se si usa solo la vista visuale | M7: import dinamico in `host.ts` |
| Menu nativo su macOS (ora menu nella finestra) | M7 |
| Più finestre (oggi solo schede) | dopo v1.0 o M7 |
| Albero file aggiornato solo al focus della finestra (nessun watcher) | `notify` è ora una dipendenza (M4): riusarlo |
| Note a piè di pagina: niente popup/modifica visuale | dopo v1.0 |
| Apice/pedice `^x^` / `~x~` (conflitto con il barrato `~x~` di GFM) | solo come opzione, dopo v1.0 |
| PDF senza dialog di stampa; header/footer personalizzati | M7 |
| Export su macOS: `print()` in WKWebView non verificato | da provare su un Mac |
| Modifiche manuali a `settings.json` applicate solo al riavvio (nessun watcher) | dopo v1.0 |
| Installer non firmati | dopo v1.0 (SPEC §17) |
| Azioni GitHub su Node 20 deprecato (avvisi in CI) | aggiornare checkout/setup-node/pnpm/pages a versioni Node 24 |
| Web: immagini relative non caricabili; zip per immagini incollate | Fase 2 |

## 7. Come lavorare con l'utente

- Parla **italiano**; è un utente Typora, non sviluppatore: fa da **tester** delle build alpha.
- Ha autorizzato commit e push autonomi sulla repo. Alla fine di ogni milestone: build dell'installer, avvio dell'app,
  commit + push, poi un messaggio con **cosa provare** (elenco puntato) e cosa non è stato verificato.
- Vuole essere interpellato con domande quando i requisiti non sono chiari (non indovinare decisioni di prodotto).
