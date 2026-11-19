# MarkType: stato del progetto e passaggio di consegne

> **Leggere per primo all'inizio di ogni sessione.** Aggiornare alla fine di ogni blocco di lavoro (insieme a
> [ROADMAP.md](ROADMAP.md) e [CHANGELOG.md](../CHANGELOG.md)).
>
> Ultimo aggiornamento: **2026-11-19**, dopo la release `v0.3.0` (alpha 3, prima pre-release pubblica su GitHub).

## 1. Dove siamo

| Milestone | Stato | Commit | Testata dall'utente |
|---|---|---|---|
| M0 Fondamenta (monorepo, Tauri, CI) | ✅ completata | `4a677c9` | sì |
| M1 Nucleo editor → alpha 1 | ✅ completata | `9a1ef18` | sì, "funziona tutto" |
| M2 Cartelle, schede, sidebar → alpha 2 | ✅ completata | `8288b22` | sì, "funziona tutto bene" |
| M3 Rendering avanzato → alpha 3 | ✅ completata, rilasciata come `v0.3.0` | `c8efd1f` | **no, in attesa di test** |
| M4 Temi → alpha 4 | ⏭️ **prossima** | | |
| M5 Immagini e appunti → alpha 5 | da fare | | |
| M6 Export e integrazione OS → beta | da fare | | |
| M7 Rifinitura → v1.0 | da fare | | |
| Fase 2: versione web (GitHub Pages) | online su https://follen99.github.io/MarkType/ (apri/salva file singolo); resto da fare | | |

Dettaglio di ogni voce (fatto/da fare) in [ROADMAP.md](ROADMAP.md); requisiti concordati in [SPEC.md](SPEC.md).

### Ultima build (Windows 11, release)
- Installer NSIS `MarkType_0.1.0_x64-setup.exe`: **4,43 MB** (target < 15 MB). `marktype.exe`: 7,41 MB.
- RAM a vuoto (M0): ~206 MB privati, quasi tutti WebView2 → **sopra il target di 150 MB**, da ottimizzare in M7.
- Bundle JS iniziale ~330 KB gzip; Mermaid, KaTeX, linguaggi di highlight, DOMPurify e gemoji sono chunk lazy.

## 2. Prossimo passo: M4 Temi

Obiettivo (SPEC §12, [THEMES.md](THEMES.md)): temi Typora che funzionano senza modifiche.

1. **Rust** `commands/themes.rs`: cartella temi utente (`app_config_dir()/themes`, cioè `%APPDATA%\MarkType\themes`),
   `list_themes` (file `*.css` + `*.meta.json` opzionale; ignorare `base.user.css` e `*.user.css`), `read_theme`,
   watcher per il live reload (crate `notify`) che emette un evento Tauri; comando per aprire la cartella.
2. **Asset dei temi**: i temi usano `url('./nome/font.woff')` relativi al CSS. Non iniettare il CSS come testo:
   caricarlo come `<link>` dal protocollo asset (`convertFileSrc`) così i percorsi relativi funzionano, e dare allo
   scope dell'asset protocol la cartella temi.
3. **Frontend**: `packages/app/src/theme.ts` oggi sceglie light/dark dal sistema (`setThemeUrl`). Sostituirlo con un
   theme manager: ordine `base.css` → tema → `base.user.css` → `<tema>.user.css`; tema scelto salvato in prefs;
   menu **Temi** nella barra (nuovo `MenuDef`, voci dinamiche, spunta sul tema attivo); opzione "segui il sistema"
   (coppia tema chiaro/scuro).
4. **Temi inclusi**: light, dark (esistono in `packages/themes/builtin/`), aggiungere **paper/sepia**, e
   **Formal Dark Pro** (già copiato in `packages/themes/builtin/formal-dark-pro/`, licenza MIT, va solo registrato).
5. **Compatibilità**: verificare con formal-dark-pro.css (usa `#write`, `.md-fences`, `.cm-s-inner`, `.md-focus`,
   `#typora-sidebar`, `.outline-item`, `.file-list-item`, `.md-meta`, `.md-task-list-item`, `.md-alert`…) e con 2-3
   temi popolari della galleria Typora. Il DOM è già compatibile; mancano probabilmente classi Typora come
   `.typora-export` / `content` (wrapper), `#write.first-line` ecc. → controllare i selettori del tema e aggiungere
   classi dove serve. I temi Typora definiscono spesso solo colori per il loro sidebar: verificare la nostra chrome
   (`packages/themes/chrome.css`), che usa le variabili Typora.
6. Test: screenshot di confronto nel browser integrato (vedi §5).

Poi M5 (immagini: incolla `Ctrl+V` → `./assets`, rinomina in caso di conflitto `-1`, `-2`, mai sovrascrivere;
pattern nome; documenti non salvati → cartella temporanea; front matter `typora-copy-images-to`; incolla
HTML → Markdown con `rehype-parse` + `rehype-remark`).

## 3. Mappa del codice

```
apps/desktop/src/platform/tauri.ts   Platform su Tauri (invoke dei comandi Rust, dialog, opener, prefs = localStorage)
apps/desktop/src-tauri/src/commands/ app.rs · fs.rs (lettura UTF-8, scrittura atomica, stamp mtime+size, conflitti)
                                     folder.rs (lista cartelle, crea/rinomina/sposta/cestino) · search.rs (ricerca)
                                     drafts.rs (bozze per il recupero crash, in app_data_dir/drafts)
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
  App.svelte                         composizione, comandi (run), scorciatoie, avvio (ultima cartella, recupero bozze)
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
- Preferenze UI (sidebar, autosave, modalità, ultima cartella, recenti) oggi in `platform.prefs` (localStorage):
  in M6 migrano in `settings.json`.

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
| Albero file aggiornato solo al focus della finestra (nessun watcher) | M4 introduce `notify`: riusarlo |
| Note a piè di pagina: niente popup/modifica visuale | dopo v1.0 |
| Apice/pedice `^x^` / `~x~` (conflitto con il barrato `~x~` di GFM) | solo come opzione, dopo v1.0 |
| Scorciatoie personalizzabili (`keybindings.json`), pannello impostazioni | M6 |
| Apertura da riga di comando / doppio clic / menu contestuale / istanza singola | M6 |
| Installer non firmati | dopo v1.0 (SPEC §17) |
| Azioni GitHub su Node 20 deprecato (avvisi in CI) | aggiornare checkout/setup-node/pnpm/pages a versioni Node 24 |
| Web: immagini relative non caricabili; zip per immagini incollate | Fase 2 |

## 7. Come lavorare con l'utente

- Parla **italiano**; è un utente Typora, non sviluppatore: fa da **tester** delle build alpha.
- Ha autorizzato commit e push autonomi sulla repo. Alla fine di ogni milestone: build dell'installer, avvio dell'app,
  commit + push, poi un messaggio con **cosa provare** (elenco puntato) e cosa non è stato verificato.
- Vuole essere interpellato con domande quando i requisiti non sono chiari (non indovinare decisioni di prodotto).
