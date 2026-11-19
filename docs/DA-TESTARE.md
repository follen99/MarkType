# Cose da testare

Elenco per l'utente (tester). Si spunta `[x]` ciò che funziona; per i problemi basta una riga con cosa è
successo. Dopo i test l'agente aggiorna la colonna "Testata dall'utente" in [STATUS.md](STATUS.md).

## v0.6.0 (M6: impostazioni, riga di comando, export)

Installare `MarkType_0.6.0_x64-setup.exe` dalla pagina Releases (dopo aver premuto **Publish release** sulla
bozza `v0.6.0`).

**Impostazioni**
- [ ] Al primo avvio della 0.6.0 tema, ultima cartella, file recenti, modalità e opzioni immagini sono quelli
      di prima (vengono copiati in `%APPDATA%\MarkType\settings.json`).
- [ ] File → Impostazioni… (oppure `Ctrl+,`) apre il pannello; `Esc` o "Chiudi" lo chiudono.
- [ ] Dimensione del testo e larghezza della pagina cambiano subito il documento; dopo un riavvio restano.
- [ ] Lingua: scegliere English, riavviare: menu in inglese. Poi rimettere "Come il sistema".
- [ ] "Riapri l'ultima cartella all'avvio" spento: al riavvio la cartella non si riapre.
- [ ] Le opzioni immagini del pannello sono le stesse del menu Formato (cambiandone una, cambia anche l'altra).
- [ ] "Apri settings.json" apre il file in un editor di testo. Una modifica a mano (es. `"autosave": true`)
      vale dopo il riavvio.
- [ ] Rompere apposta `settings.json` (togliere una `}`), riavviare: compare un avviso e il file non viene
      toccato. Poi correggerlo.

**Scorciatoie personalizzate**
- [ ] "Apri keybindings.json", scrivere `"bold": "Mod+Shift+B"` (dentro le graffe), salvare, riavviare:
      `Ctrl+Shift+B` mette il grassetto e il menu Formato mostra la nuova scorciatoia.
- [ ] Una voce sbagliata (es. `"pippo": "F2"`) dà un avviso all'avvio con il nome della voce.

**Aprire file dall'esterno**
- [ ] Doppio clic su un file `.md` in Esplora risorse: si apre in MarkType (la prima volta Windows può chiedere
      con quale app aprirlo: scegliere MarkType).
- [ ] Con MarkType già aperto, doppio clic su un altro `.md`: si apre in una nuova scheda della stessa finestra
      (nessuna seconda finestra).
- [ ] Tasto destro su una cartella → "Apri con MarkType": la cartella si apre nella sidebar. Su Windows 11 la
      voce è sotto "Mostra altre opzioni".
- [ ] Tasto destro nello spazio vuoto dentro una cartella → "Apri con MarkType".
- [ ] Tasto destro su un `.md` → "Apri con MarkType".
- [ ] Da terminale: `marktype nota.md` e `marktype .` (se `marktype` non è nel PATH, usare il percorso completo,
      di solito `%LOCALAPPDATA%\MarkType\marktype.exe`).

**Export** (menu File)
- [ ] "Esporta come HTML…": il file si apre nel browser con lo stesso aspetto del tema (anche un tema utente
      con font propri), formule, diagrammi Mermaid, codice colorato, tabelle; i link dell'indice `[toc]`
      portano ai titoli. Alla fine "Apri" apre il file.
- [ ] Immagini nell'HTML: con "Incorpora le immagini nell'HTML" spento si vedono se l'HTML resta vicino al
      documento; acceso, si vedono anche spostando l'HTML altrove.
- [ ] "Esporta come PDF…": si apre la finestra di stampa; scegliere "Salva come PDF" (o "Microsoft Print to
      PDF"). Il PDF deve avere il tema, senza barre o pulsanti dell'app.
- [ ] Senza Pandoc: "Esporta come Word (.docx)…" spiega che Pandoc non è installato.
- [ ] Con Pandoc installato (https://pandoc.org/installing.html): Impostazioni → "Verifica" mostra la versione;
      export Word, OpenDocument, RTF, EPUB, LaTeX producono file che si aprono, con le immagini.
- [ ] Versione web (https://follen99.github.io/MarkType/): "Esporta come HTML…" scarica il file, "Esporta come
      PDF…" apre la stampa.

Non verificato dall'agente: il dialog di stampa vero (è stato simulato), Pandoc (non installato su questo PC),
l'installazione con l'associazione dei file e il menu contestuale, macOS e Linux.

## v0.5.0 (M5: immagini e appunti), ancora da testare

- [ ] Screenshot (`Win+Shift+S`) e `Ctrl+V` in un documento salvato: l'immagine compare e nasce
      `assets/<nome documento>-<data e ora>.png`.
- [ ] Incollare due volte la stessa immagine con il modello `${original}`: `image.png` e `image-1.png`.
- [ ] Trascinare un'immagine da Esplora risorse nel testo; trascinare un `.md` sulla finestra (si apre).
- [ ] Formato → "Inserisci immagine da file…" con una o più immagini.
- [ ] Destinazioni `./assets`, `./${filename}.assets`, cartella personalizzata, "Nessuna copia".
- [ ] Front matter `typora-copy-images-to: ./img`.
- [ ] Documento nuovo mai salvato: incollare un'immagine, poi salvare: l'immagine va in `assets` e il
      percorso diventa relativo.
- [ ] Incollare da una pagina web e da Word: diventa Markdown pulito. In un blocco di codice resta testo.

## v0.3.0 e v0.4.0

Vedi le righe "Da testare" di M3 e M4 in [ROADMAP.md](ROADMAP.md).
