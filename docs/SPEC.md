# MarkType: specifica funzionale

> Documento di riferimento del prodotto. Ogni decisione qui è stata concordata con il product owner.
> Stato di avanzamento: [ROADMAP.md](ROADMAP.md). Scelte tecniche: [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Visione

MarkType è un editor markdown **WYSIWYG stile Typora**: leggero da installare e da eseguire, multipiattaforma,
con temi personalizzabili (compatibili con i temi Typora) e un'esperienza di scrittura "senza attrito".

| Obiettivo | Target |
|---|---|
| Dimensione installer | < 15 MB |
| Avvio a freddo | < 1 s |
| RAM con un documento aperto | < 150 MB |
| Documento grande | fluido fino a ~10.000 righe |
| Librerie pesanti (Mermaid, KaTeX, linguaggi di highlight) | caricate solo quando servono |

## 2. Fasi e piattaforme

| Fase | Contenuto |
|---|---|
| **Fase 1: Desktop** | Windows, macOS, Linux. Rilascio unico `v1.0` quando *tutte* le funzioni di fase 1 sono pronte. Build alpha/beta interne per i test. |
| **Fase 2: Web** | Stessa interfaccia, ospitata su GitHub Pages, funzionalità ridotte (§13). |
| **Futuro: Mobile** | Android/iOS tramite Tauri 2 mobile. L'architettura deve restare pronta (adapter di piattaforma, UI responsive), ma non si sviluppa ora. |

## 3. Stack (decisione)

- **Tauri 2**: backend in Rust, UI in TypeScript dentro la webview di sistema (WebView2 / WKWebView / WebKitGTK).
  L'app è una **finestra nativa**: non apre il browser.
- Il frontend è condiviso al 100% tra desktop, web e (in futuro) mobile.
- Licenza: **GPL-3.0**.

## 4. Finestra e interfaccia

- **Barra del titolo personalizzata** (senza cornice di sistema), disegnata dall'app e coerente con il tema:
  menu (File, Modifica, Paragrafo, Formato, Vista, Temi, Aiuto), titolo del documento, pulsanti della finestra.
  Su macOS restano i "semafori" nativi (`titleBarStyle: overlay`).
- UI moderna e "smussata": angoli arrotondati, transizioni brevi, nessun elemento spigoloso. Rispetta `prefers-reduced-motion`.
- **Schede (tab)** per più documenti aperti, più la possibilità di aprire nuove finestre.
- **Barra di stato**: parole, caratteri, righe, tempo di lettura, posizione del cursore, modalità corrente, stato di salvataggio.
- **Lingua dell'interfaccia**: italiano e inglese (i18n estendibile), default = lingua di sistema.

## 5. Modalità di editing

Tutte e tre sono disponibili; la **modalità seamless è quella principale e di default**.

1. **Seamless (stile Typora)**: il documento appare renderizzato; la sintassi markdown (`**`, `#`, `[]()`, …) compare
   solo sull'elemento inline/blocco dove si trova il cursore e sparisce quando il cursore esce.
   Scrivere la sintassi la trasforma subito in formattazione (es. `## ` → H2, `- ` → lista, ```` ``` ```` → blocco codice).
2. **Sorgente** (`Ctrl+/`): markdown puro con evidenziazione della sintassi.
3. **Split view**: sorgente a sinistra e anteprima a destra, con scroll sincronizzato.

**Fedeltà del file:** è accettabile che il markdown venga normalizzato in uno stile coerente al salvataggio
(es. marcatori di lista, enfasi). Lo stile di serializzazione deve essere stabile (salvare due volte = stesso output)
e configurabile nei punti principali (marcatore di lista `-`/`*`, enfasi `*`/`_`, fence ```` ``` ````/`~~~`).

**Titoli:** H1–H6 con dimensione e peso diversi nella vista renderizzata (definiti dal tema).

## 6. Scorciatoie da tastiera

- Default **identici a Typora** (su macOS `Ctrl` → `Cmd`). Tabella completa in [SHORTCUTS.md](SHORTCUTS.md).
- **Personalizzabili** da file di configurazione (`keybindings.json`) e dal pannello impostazioni.

## 7. Markdown supportato

| Area | Dettaglio |
|---|---|
| Base | CommonMark completo |
| GFM | tabelle (con modifica visuale: aggiungi/rimuovi righe e colonne, allineamento), task list, ~~barrato~~, autolink, note a piè di pagina |
| Estensioni | `==evidenziato==`, emoji `:smile:`, apice/pedice (`^x^`, `~x~`) |
| Codice | blocchi con evidenziazione della sintassi (linguaggi caricati on demand), codice inline |
| Diagrammi | Mermaid (blocchi ```` ```mermaid ````), renderizzati in vista e modificabili cliccandoci sopra |
| Matematica | KaTeX: inline `$…$` e a blocchi `$$…$$` |
| Metadati | front matter YAML (`---` … `---`) mostrato come blocco dedicato |
| Indice | `[toc]` genera l'indice dei titoli dentro il documento |
| Callout | alert GitHub: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` |
| HTML | HTML inline e a blocchi (`<br>`, `<img width>`, `<details>`, …), sanificato |

## 8. Cartelle e barra laterale

- **Apri cartella**: la sidebar sinistra ha due schede:
  - **File**: albero di cartelle e sottocartelle (solo `.md`/`.markdown` e immagini, filtro configurabile);
  - **Indice**: TOC dei titoli del documento attivo, cliccabile, con il titolo corrente evidenziato.
- **Gestione file** dalla sidebar: nuovo file/cartella, rinomina, sposta con drag & drop, elimina (nel cestino di sistema).
- **Ricerca nella cartella**: testo (opzioni maiuscole/minuscole, parola intera, regex) con risultati cliccabili.
- **Quick open** (`Ctrl+P`): ricerca fuzzy dei file della cartella.
- Cliccare un file lo apre in una scheda (o attiva la scheda già aperta).

## 9. Salvataggio

- `Ctrl+S` sempre disponibile; scrittura atomica (file temporaneo + rename) per non corrompere mai un file.
- **Autosalvataggio** (attivabile): dopo N secondi di inattività e al cambio di scheda o alla chiusura.
- **Recupero bozze**: le modifiche non salvate vengono salvate periodicamente nella cartella dati dell'app; dopo una
  chiusura anomala, alla riapertura si propone di recuperarle.
- Encoding UTF-8 (BOM preservato se presente); fine riga preservata (LF/CRLF) per ogni file.
- **Protezione minima dalle modifiche esterne**: prima di scrivere si controlla che il file sul disco non sia cambiato
  dall'ultima lettura (es. dopo un `git pull`); se è cambiato si chiede se sovrascrivere o ricaricare. Questo vale
  anche per l'autosalvataggio. La ricarica automatica resta fuori scope (§19).

## 10. Immagini

Si applica a **incolla (`Ctrl+V`)**, drag & drop e inserimento da file.

- **Destinazione** (configurabile, globale e sovrascrivibile per documento tramite front matter `typora-copy-images-to`):
  - `./assets` (**default**), `./${filename}.assets`, cartella personalizzata (relativa o assoluta), nessuna copia.
- **Nome del file**: pattern configurabile con token `${filename}`, `${date}`, `${time}`, `${timestamp}`, `${hash}`,
  `${original}`; oppure richiesta del nome al momento dell'incolla. Default: `${filename}-${timestamp}`.
- **Nessun conflitto mai**: se esiste già un file con lo stesso nome, il nuovo file viene rinominato con un suffisso
  (`nome-1.png`, `nome-2.png`, …). Non si sovrascrive mai un file esistente.
- Nel markdown il percorso inserito è relativo al documento, con `/` e spazi codificati.
- Se il documento non è ancora stato salvato: l'immagine va in una cartella temporanea e viene spostata nella
  destinazione al primo salvataggio, con i percorsi aggiornati.

## 11. Copia e incolla

- **Incolla HTML → Markdown**: il contenuto copiato da pagine web, Word, ecc. viene convertito in markdown
  (titoli, liste, link, tabelle, codice, immagini).

## 12. Temi

- **Compatibili con Typora**: il DOM dell'editor e della sidebar replica gli ID, le classi e le variabili CSS
  di Typora (`#write`, `.md-fences`, `.cm-s-inner`, `.md-focus`, `#typora-sidebar`, `.outline-item`,
  `--bg-color`, `--text-color`, …), così i temi Typora esistenti funzionano senza modifiche (a parte gli elementi
  di UI che MarkType non ha). Dettagli in [THEMES.md](THEMES.md).
- **Temi inclusi**: chiaro (default), scuro, sepia/"paper", **Formal Dark Pro** (licenza MIT, con attribuzione).
- **Cartella temi** apribile dalle impostazioni: basta copiare `nome.css` (+ cartella `nome/` per gli asset);
  **live reload** delle modifiche al CSS.
- **CSS utente**: `base.user.css` (sopra ogni tema) e `<tema>.user.css` (sopra un tema specifico).
- Il cambio tema avviene dal menu "Temi" senza riavvio.

## 13. Esportazione

- **PDF** con il tema corrente (impaginazione, margini, header/footer opzionali).
- **HTML** autonomo con il CSS del tema incorporato (immagini opzionalmente incorporate in base64).
- **Pandoc** (se installato): DOCX, ODT, RTF, EPUB, LaTeX, … Il percorso di Pandoc è configurabile.

## 14. Integrazione con il sistema operativo

- Associazione dei file `.md`/`.markdown` (opzionale nell'installer).
- Menu contestuale "Apri con MarkType" su file e cartelle (Windows Explorer; su macOS/Linux tramite "Apri con").
- Riga di comando: `marktype file.md`, `marktype ./cartella`.
- **Istanza singola**: aprire un file con l'app già aperta lo apre in una scheda della finestra esistente.

## 15. Editor: funzioni aggiuntive

- **Cerca e sostituisci** nel documento (`Ctrl+F` / `Ctrl+H`), con regex e maiuscole/minuscole.
- Annulla/ripeti, selezione intelligente, auto-chiusura delle coppie (`()`, `[]`, `**`, `` ` ``).
- Clic sui link con `Ctrl` per aprirli (i link a `.md` locali si aprono in MarkType).

## 16. Impostazioni

- Pannello impostazioni grafico + file `settings.json` modificabile a mano.
- Posizione: cartella di configurazione utente (`%APPDATA%\MarkType`, `~/Library/Application Support/MarkType`,
  `~/.config/marktype`).
- Contenuti principali: tema, lingua, font/dimensione base, larghezza della pagina, autosalvataggio, opzioni immagini,
  stile di serializzazione markdown, scorciatoie, percorso Pandoc, cartelle recenti.

## 17. Distribuzione

- **GitHub Releases**, build automatiche con GitHub Actions per ogni tag `v*`:
  - Windows: installer `.exe` (NSIS) e `.msi`;
  - macOS: `.dmg` universale (Intel + Apple Silicon);
  - Linux: `.AppImage`, `.deb`, `.rpm`.
- **Nessuna firma digitale per ora**: il README spiega come superare SmartScreen/Gatekeeper.
  La pipeline è predisposta per aggiungere la firma in futuro.

## 18. Versione web (fase 2)

- Stessa interfaccia dell'app desktop, pubblicata su GitHub Pages.
- **Apri/salva singolo file**: apertura da disco; salvataggio sul posto dove il browser lo consente
  (File System Access API, Chromium), altrimenti come download.
- **Immagini incollate**: tenute in memoria; se il documento contiene immagini locali, il salvataggio produce un
  **pacchetto `.zip`** con il `.md` e la cartella `assets/`. Aprire uno `.zip` di questo tipo lo ripristina.
- Funzioni assenti nel web: apertura di cartelle, ricerca nella cartella, Pandoc, integrazione con l'OS.

## 19. Fuori scope (per ora)

Focus/typewriter mode, controllo ortografico, cronologia delle versioni, ricarica delle modifiche esterne,
upload di immagini su servizi esterni, compressione delle immagini, firma degli installer, package manager
(winget/Homebrew/…), aggiornamento automatico, PWA/offline, apertura da GitHub/URL, copia come Markdown/HTML,
incolla come testo semplice dedicato. Possono rientrare in versioni successive.
