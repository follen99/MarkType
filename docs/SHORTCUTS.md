# Scorciatoie da tastiera (default)

I default ricalcano quelli di Typora su Windows/Linux. Su macOS `Ctrl` diventa `Cmd` e `Alt` diventa `Option`.
Si personalizzano in `keybindings.json` (vedi in fondo).

**Layout di tastiera.** Una scorciatoia viene riconosciuta prima dal carattere che il tasto produce, poi dalla posizione
fisica del tasto sulla tastiera US. Sulla tastiera italiana quindi `Ctrl+-` e `Ctrl++` agiscono sul livello del titolo,
`Ctrl+Shift+7` (cioè `Ctrl+/`) apre la modalità sorgente, e `Ctrl+Shift+è` vale come `Ctrl+Shift+[`.

## File
| Azione | Scorciatoia |
|---|---|
| Nuovo file (nuova scheda) | `Ctrl+N` |
| Scheda successiva / precedente | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Apri file | `Ctrl+O` |
| Apri cartella | `Ctrl+Shift+O` |
| Quick open | `Ctrl+P` |
| Riapri la scheda chiusa | `Ctrl+Shift+T` |
| Salva | `Ctrl+S` |
| Salva con nome | `Ctrl+Shift+S` |
| Chiudi scheda | `Ctrl+W` |
| Impostazioni | `Ctrl+,` |

## Modifica
| Azione | Scorciatoia |
|---|---|
| Annulla / Ripeti | `Ctrl+Z` / `Ctrl+Y` (`Ctrl+Shift+Z`) |
| Seleziona parola | `Ctrl+D` |
| Seleziona riga/frase | `Ctrl+L` |
| Seleziona il blocco di stile | `Ctrl+E` |
| Elimina parola | `Ctrl+Shift+D` |
| Vai all'inizio / alla fine | `Ctrl+Home` / `Ctrl+End` |
| Trova / Sostituisci | `Ctrl+F` / `Ctrl+H` |
| Trova successivo / precedente | `F3` / `Shift+F3` |
| Cerca nella cartella | `Ctrl+Shift+F` |

## Paragrafo
| Azione | Scorciatoia |
|---|---|
| Titolo 1–6 | `Ctrl+1` … `Ctrl+6` |
| Paragrafo | `Ctrl+0` |
| Aumenta / diminuisci il livello del titolo (H3 → H2 → H1 / H1 → H2 → H3) | `Ctrl+=` o `Ctrl++` / `Ctrl+-` |
| Tabella | `Ctrl+T` |
| Blocco di codice | `Ctrl+Shift+K` |
| Blocco matematico | `Ctrl+Shift+M` |
| Citazione | `Ctrl+Shift+Q` |
| Lista numerata / puntata | `Ctrl+Shift+[` / `Ctrl+Shift+]` |
| Aumenta / riduci il rientro | `Ctrl+]` / `Ctrl+[` |

## Formato
| Azione | Scorciatoia |
|---|---|
| Grassetto | `Ctrl+B` |
| Corsivo | `Ctrl+I` |
| Sottolineato (`<u>`) | `Ctrl+U` |
| Codice inline | ``Ctrl+Shift+` `` |
| Barrato | `Alt+Shift+5` |
| Evidenziato (`==testo==`) | `Ctrl+Shift+H` |
| Nuova riga nella tabella | `Ctrl+Invio` |
| Link | `Ctrl+K` |
| Immagine | `Ctrl+Shift+I` |
| Rimuovi formattazione | `Ctrl+\` |

## Vista
| Azione | Scorciatoia |
|---|---|
| Mostra/nascondi la sidebar | `Ctrl+Shift+L` |
| Sidebar: Indice / File | `Ctrl+Shift+1` / `Ctrl+Shift+3` |
| Modalità sorgente | `Ctrl+/` |
| Split view (MarkType) | `Ctrl+Alt+/` |
| Schermo intero | `F11` |
| Zoom: reimposta / più / meno | `Ctrl+Shift+0` / `Ctrl+Shift+=` / `Ctrl+Shift+-` |
| Scheda successiva / precedente | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Strumenti per sviluppatori (build di debug) | `Shift+F12` |

## Personalizzare le scorciatoie (`keybindings.json`)

Impostazioni (`Ctrl+,`) → **Apri keybindings.json** apre il file (in `%APPDATA%/MarkType` su Windows,
`~/Library/Application Support/MarkType` su macOS, `~/.config/marktype` su Linux). Esempio:

```json
{
  "bold": "Mod+Shift+B",
  "toggleSidebar": ["Mod+Shift+L", "F8"],
  "underline": null
}
```

- `Mod` è `Ctrl` su Windows/Linux e `Cmd` su macOS; gli altri modificatori sono `Ctrl`, `Alt`, `Shift`.
- Un comando elencato perde le sue scorciatoie predefinite; `null` lo lascia senza scorciatoia.
- Se una scorciatoia è usata da due comandi vince quella scritta nel file.
- Le chiavi che iniziano con `//` sono commenti. Le modifiche valgono dal prossimo avvio.

Nomi dei comandi:

- File: `newFile` `openFile` `openFolder` `quickOpen` `save` `saveAs` `toggleAutosave` `exportHtml`
  `exportPdf` `exportDocx` `exportOdt` `exportRtf` `exportEpub` `exportLatex` `preferences` `openKeybindings`
  `closeTab` `reopenTab` `nextTab` `prevTab` `closeWindow`
- Modifica: `undo` `redo` `selectAll` `selectWord` `selectLine` `selectScope` `deleteWord` `find` `replace`
  `findNext` `findPrev` `showSearch`
- Paragrafo: `paragraph` `heading1` … `heading6` `headingUp` `headingDown` `quote` `bulletList`
  `orderedList` `taskList` `codeBlock` `mathBlock` `horizontalRule` `table` `indent` `outdent` `exitBlock`
- Formato: `bold` `italic` `underline` `inlineCode` `strike` `highlight` `clearFormat` `link` `image`
  `insertImageFile`
- Vista: `toggleSidebar` `showOutline` `showFiles` `toggleSource` `toggleSplit` `cycleMode` `zoomIn`
  `zoomOut` `zoomReset` `fullscreen` `followSystemTheme` `openThemesFolder` `about`
