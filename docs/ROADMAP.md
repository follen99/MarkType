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
- [x] Workflow di release (tag `v*` → installer su GitHub Releases, bozza); verificato con `v0.3.0` (2026-11-19)

Misure M0 (Windows 11, build release, 2026-11-19): installer NSIS **1,09 MB**, MSI 1,59 MB, `marktype.exe` 2,98 MB;
finestra creata in ~1,7 s al primo avvio a freddo; RAM privata totale **~206 MB**, di cui ~195 MB nei processi WebView2.
La RAM è sopra il target (< 150 MB): da ottimizzare in M7 (argomenti WebView2, `MemoryUsageTargetLevel`, un solo processo renderer).

## M1: Nucleo dell'editor → **alpha 1**
- [x] Schema ProseMirror (blocchi e inline CommonMark + GFM, front matter, math e alert preservati)
- [x] Ponte mdast ↔ ProseMirror (parse + serializzazione, stile configurabile)
- [x] Suite di test round-trip con fixture (stabilità: salvare due volte = stesso output)
- [x] DOM e classi compatibili con Typora (`#write`, `.md-fences`, `.md-focus`, …)
- [x] Modalità seamless: marcatori visibili solo al cursore
- [x] Input rules (`# `, `- `, `1. `, `> `, `[ ] `, ```` ``` ````, `---`, `$$`, `**x**`, `*x*`, `` `x` ``, `~~x~~`, link, immagini)
- [x] Scorciatoie di default stile Typora (SHORTCUTS.md)
- [x] Modalità sorgente (CodeMirror 6) con `Ctrl+/`
- [x] Split view con scroll sincronizzato (`Ctrl+Alt+/`)
- [x] Apri / salva / salva con nome di un singolo file (scrittura atomica, LF/CRLF, BOM, conflitti)
- [x] Barra del titolo personalizzata con menu
- [x] Tema chiaro e tema scuro di base (seguono il sistema)
- [x] Barra di stato (parole, caratteri, righe, tempo di lettura, cursore)
- Un file aperto e non modificato non viene mai riformattato: anche Salva riscrive il testo originale.
- Limiti noti di alpha 1: URL dei link e immagini si modificano da un dialog; matematica, HTML e note
  a piè di pagina appaiono come sorgente (rendering in M3); su macOS il menu è nella finestra, non nella barra di sistema.
- Da testare: scrittura quotidiana su un file, scorciatoie, cambio di modalità, salvataggio, `samples/showcase.md`.

## M2: Cartelle, schede, sidebar → **alpha 2**
- [x] Apri cartella, albero dei file (lazy, solo cartelle e markdown, ordine naturale, ultima cartella riaperta all'avvio)
- [x] Scheda "Indice" (TOC) con il titolo corrente evidenziato e navigazione
- [x] Schede dei documenti (`Ctrl+Tab`, `Ctrl+W`, `Ctrl+Shift+T`, clic centrale per chiudere)
- [ ] Nuove finestre (rimandato: le schede coprono il caso d'uso principale)
- [x] Gestione file: nuovo, rinomina, sposta (drag & drop), elimina nel cestino, copia percorso
- [x] Quick open `Ctrl+P` (fuzzy, schede aperte + file della cartella + recenti)
- [x] Ricerca nella cartella (Rust, rispetta `.gitignore`, max 2000 risultati)
- [x] Cerca e sostituisci nel documento (`Ctrl+F` / `Ctrl+H`, regex, maiuscole, parola intera) in tutte le modalità
- [x] Autosalvataggio (File → Salvataggio automatico, anche al cambio scheda e quando la finestra perde il focus)
- [x] Recupero bozze dopo una chiusura anomala
- [x] Controllo dell'mtime prima di scrivere (protezione dalle modifiche esterne)
- [x] Etichetta della modalità nella barra di stato cliccabile (visuale → sorgente → divisa)
- [x] Scorciatoie che seguono il layout della tastiera (`Ctrl+-` / `Ctrl++` sul layout italiano)
- [x] Ctrl+clic su un link a un file `.md` locale lo apre in una scheda
- Da testare: lavorare su una cartella reale (es. una repo di note), più schede, crash simulato
  (termina MarkType dal Task Manager con modifiche non salvate e riaprilo).

## M3: Rendering avanzato → **alpha 3**
- [x] Evidenziazione della sintassi nei blocchi di codice (oltre 100 linguaggi caricati on demand, classi `cm-*`), etichetta del linguaggio modificabile
- [x] Mermaid (lazy, sorgente visibile quando il cursore è nel blocco, tema chiaro/scuro automatico)
- [x] KaTeX inline (`$…$`) e a blocchi (`$$`), sorgente al cursore
- [x] Tabelle con modifica visuale: barra strumenti (allineamento, righe, colonne, elimina), `| a | b |` + Invio, `Ctrl+Invio` aggiunge una riga
- [x] Task list, barrato, `==evidenziato==` (`Ctrl+Shift+H`), emoji `:smile:`, apice/pedice via `<sup>`/`<sub>`
- [x] Note a piè di pagina: riferimenti in apice e definizioni stilizzate (modificate come sorgente)
- [x] Front matter YAML (blocco dedicato, preservato)
- [x] `[toc]` nel documento, aggiornato in tempo reale e cliccabile
- [x] Alert GitHub (`> [!NOTE]` + Invio crea l'alert; colori per tipo)
- [x] HTML: blocchi renderizzati e sanificati (DOMPurify); tag inline senza attributi (`<kbd>`, `<sup>`, `<mark>`…) come formattazione; `<br>` come a capo
- Rimandati: apice/pedice con la sintassi `^x^` / `~x~` (entra in conflitto con il barrato a una tilde di GFM);
  note a piè di pagina con popup e modifica visuale.
- Da testare: documenti tecnici reali con codice, diagrammi e formule; `samples/showcase.md`.

## M4: Temi → **alpha 4**
- [x] Loader dei temi (base → tema → base.user.css → tema.user.css), sempre dopo i CSS caricati al bisogno
- [x] Cartella temi utente (`%APPDATA%\MarkType\themes`) + live reload (crate `notify`), percorsi relativi funzionanti
- [x] Temi inclusi: Chiaro, Carta, Scuro, Formal Dark Pro
- [x] Menu Temi con cambio senza riavvio, gruppi chiari/scuri, "Segui il tema del sistema"
- [~] Test di compatibilità: Formal Dark Pro (screenshot nel browser integrato) e tema di prova in `scripts/smoke-desktop.mjs`;
  i temi della galleria Typora li prova l'utente
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
- [ ] Caricare CodeMirror solo al primo passaggio in modalità sorgente (bundle iniziale oggi 326 KB gzip)
- [ ] Menu nativo nella barra di sistema su macOS
- [ ] Accessibilità di base (navigazione da tastiera nei menu, contrasto)
- [ ] README con screenshot, guida all'installazione per OS non firmati
- [ ] CHANGELOG e release `v1.0.0`

## Fase 2: versione web
- [ ] `WebPlatform` (apri/salva singolo file, File System Access dove disponibile, altrimenti download)
- [ ] Immagini in memoria + salvataggio/apertura come `.zip`
- [ ] Nascondere le funzioni non disponibili (cartelle, ricerca, Pandoc)
- [x] Deploy automatico su GitHub Pages (a ogni push su `main`, https://follen99.github.io/MarkType/)
- [ ] Test e2e (Playwright) su Chromium, Firefox, WebKit

## Futuro
- [ ] App mobile Android/iOS (Tauri 2 mobile + UI touch)
- [ ] Funzioni oggi fuori scope (SPEC §19)
