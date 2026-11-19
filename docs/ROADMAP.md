# MarkType: roadmap e avanzamento

> Legenda: `[x]` fatto · `[~]` in corso · `[ ]` da fare.
> La v1.0 esce solo quando tutta la fase 1 è completa ([SPEC.md](SPEC.md)). Le milestone **alpha** sono build interne
> da testare: per ognuna, la sezione "Da testare" dice cosa provare.

## M0: Fondamenta del progetto
- [x] Raccolta delle specifiche (SPEC.md)
- [x] Architettura e struttura della repository (ARCHITECTURE.md)
- [x] Documenti: roadmap, scorciatoie, temi, README, CONTRIBUTING
- [x] Testo della licenza GPL-3.0 in `LICENSE`
- [x] Toolchain di sviluppo (Rust, Node LTS, pnpm, MSVC Build Tools)
- [x] Scaffolding del monorepo pnpm (apps/desktop, apps/web, packages/*)
- [x] Progetto Tauri 2 che apre una finestra senza cornice (barra del titolo propria, tema chiaro/scuro di sistema)
- [x] CI: type-check, formattazione, test TS e Rust su Windows/macOS/Linux
- [x] Workflow di release (tag `v*` → installer su GitHub Releases, bozza)

Misure M0 (Windows 11, build release, 2026-11-19): installer NSIS **1,09 MB**, MSI 1,59 MB, `marktype.exe` 2,98 MB;
finestra creata in ~1,7 s al primo avvio a freddo; RAM privata totale **~206 MB**, di cui ~195 MB nei processi WebView2.
La RAM è sopra il target (< 150 MB): da ottimizzare in M7 (argomenti WebView2, `MemoryUsageTargetLevel`, un solo processo renderer).

## M1: Nucleo dell'editor → **alpha 1**
- [ ] Schema ProseMirror (blocchi e inline CommonMark + GFM)
- [ ] Ponte mdast ↔ ProseMirror (parse + serializzazione, stile configurabile)
- [ ] Suite di test round-trip con fixture (stabilità: salvare due volte = stesso output)
- [ ] DOM e classi compatibili con Typora (`#write`, `.md-fences`, `.md-focus`, …)
- [ ] Modalità seamless: marcatori visibili solo al cursore
- [ ] Input rules (`# `, `- `, `1. `, `> `, ```` ``` ````, `---`, `**x**`, …)
- [ ] Scorciatoie di default stile Typora (SHORTCUTS.md)
- [ ] Modalità sorgente (CodeMirror 6) con `Ctrl+/`
- [ ] Split view con scroll sincronizzato
- [ ] Apri / salva / salva con nome di un singolo file (scrittura atomica, LF/CRLF, BOM)
- [ ] Barra del titolo personalizzata con menu
- [ ] Tema chiaro e tema scuro di base
- [ ] Barra di stato (parole, caratteri, righe, tempo di lettura, cursore)
- Da testare: scrittura quotidiana su un file, scorciatoie, cambio di modalità, salvataggio.

## M2: Cartelle, schede, sidebar → **alpha 2**
- [ ] Apri cartella, albero dei file (lazy, filtro per estensione)
- [ ] Scheda "Indice" (TOC) con il titolo corrente evidenziato e navigazione
- [ ] Schede dei documenti + nuove finestre
- [ ] Gestione file: nuovo, rinomina, sposta (drag & drop), elimina nel cestino
- [ ] Quick open `Ctrl+P` (fuzzy)
- [ ] Ricerca nella cartella (Rust, streaming dei risultati)
- [ ] Cerca e sostituisci nel documento
- [ ] Autosalvataggio (configurabile)
- [ ] Recupero bozze dopo una chiusura anomala
- [ ] Controllo dell'mtime prima di scrivere (protezione dalle modifiche esterne)
- Da testare: lavorare su una cartella reale (es. una repo di note), più schede, crash simulato.

## M3: Rendering avanzato → **alpha 3**
- [ ] Evidenziazione della sintassi nei blocchi di codice (linguaggi lazy, classi `cm-*`)
- [ ] Mermaid (lazy, modifica al clic)
- [ ] KaTeX inline e a blocchi
- [ ] Tabelle con modifica visuale (righe, colonne, allineamento)
- [ ] Task list, note a piè di pagina, barrato, evidenziato, emoji, apice/pedice
- [ ] Front matter YAML
- [ ] `[toc]` nel documento
- [ ] Alert GitHub (`> [!NOTE]`, …)
- [ ] HTML inline/blocchi sanificato
- Da testare: documenti tecnici reali con codice, diagrammi e formule.

## M4: Temi → **alpha 4**
- [ ] Loader dei temi (base → tema → base.user.css → tema.user.css)
- [ ] Cartella temi utente + live reload
- [ ] Temi inclusi: light, dark, paper, Formal Dark Pro
- [ ] Menu Temi con cambio senza riavvio
- [ ] Test con temi Typora popolari (screenshot di confronto)
- Da testare: installare 2-3 temi Typora scaricati dalla galleria.

## M5: Immagini e appunti → **alpha 5**
- [ ] Incolla immagine `Ctrl+V` → salvataggio nella destinazione configurata
- [ ] Drag & drop e inserimento da file con le stesse regole
- [ ] Pattern dei nomi + richiesta del nome opzionale
- [ ] Rinomina automatica in caso di conflitto (`-1`, `-2`, …), nessuna sovrascrittura
- [ ] Documenti non salvati: cartella temporanea → spostamento al primo salvataggio
- [ ] Front matter `typora-copy-images-to` per singolo documento
- [ ] Incolla HTML → Markdown
- Da testare: screenshot incollati, immagini con lo stesso nome, documento nuovo non salvato.

## M6: Export e integrazione con l'OS → **beta**
- [ ] Export HTML autonomo
- [ ] Export PDF (nativo su Windows/macOS, fallback con dialog di stampa su Linux)
- [ ] Export con Pandoc (DOCX, ODT, EPUB, LaTeX, …)
- [ ] Istanza singola
- [ ] CLI `marktype <file|cartella>`
- [ ] Associazione file `.md` (installer)
- [ ] Menu contestuale "Apri con MarkType" (Windows) / integrazione "Apri con" (macOS, Linux)
- [ ] Pannello impostazioni + `settings.json` + `keybindings.json`
- [ ] i18n italiano + inglese completo
- Da testare: installazione pulita su Windows, macOS e Linux; export; doppio clic su un `.md`.

## M7: Rifinitura → **v1.0**
- [ ] Verifica dei target di prestazione (installer < 15 MB, avvio < 1 s, RAM < 150 MB, 10k righe)
- [ ] Ridurre la RAM di WebView2 (oggi ~206 MB a vuoto, vedi le misure di M0)
- [ ] Accessibilità di base (navigazione da tastiera nei menu, contrasto)
- [ ] README con screenshot, guida all'installazione per OS non firmati
- [ ] CHANGELOG e release `v1.0.0`

## Fase 2: versione web
- [ ] `WebPlatform` (apri/salva singolo file, File System Access dove disponibile, altrimenti download)
- [ ] Immagini in memoria + salvataggio/apertura come `.zip`
- [ ] Nascondere le funzioni non disponibili (cartelle, ricerca, Pandoc)
- [ ] Deploy automatico su GitHub Pages
- [ ] Test e2e (Playwright) su Chromium, Firefox, WebKit

## Futuro
- [ ] App mobile Android/iOS (Tauri 2 mobile + UI touch)
- [ ] Funzioni oggi fuori scope (SPEC §19)
