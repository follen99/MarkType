# Temi

MarkType è **compatibile con i temi di Typora**: un file `.css` scritto per Typora si copia nella cartella temi
e funziona. Questo documento descrive il contratto DOM/CSS che MarkType rispetta.

## Dove si trovano

| OS | Cartella temi |
|---|---|
| Windows | `%APPDATA%\MarkType\themes\` |
| macOS | `~/Library/Application Support/MarkType/themes/` |
| Linux | `~/.config/marktype/themes/` |

Si apre dal menu *Temi → Apri la cartella dei temi*. Un tema copiato nella cartella compare subito nel menu *Temi*,
senza riavviare.

## Struttura di un tema

```
themes/
├─ my-theme.css            ← obbligatorio; il nome del menu deriva dal file ("my-theme" → "My Theme")
├─ my-theme.meta.json      ← opzionale: name, author, version, description, tags (se contiene "dark" è un tema scuro)
├─ my-theme/               ← opzionale: font, immagini, ecc. referenziati con url('./my-theme/…')
├─ base.user.css           ← opzionale: applicato sopra qualsiasi tema
└─ my-theme.user.css       ← opzionale: applicato solo sopra my-theme
```

Ordine di caricamento: `base.css` (interno) → `<tema>.css` → `base.user.css` → `<tema>.user.css`.
Le modifiche ai file si applicano subito (live reload). I percorsi relativi (`url('./my-theme/font.woff')`,
`@import "my-theme/extra.css"`) si risolvono accanto al file del tema.

## Scelta del tema

- Menu **Temi**: i temi sono divisi in *chiari* e *scuri*. Un tema è scuro se il `.meta.json` ha il tag `dark`,
  se il nome contiene `dark`/`night`/…, oppure se il suo `--bg-color` è scuro.
- **Segui il tema del sistema** (predefinito): si usa un tema chiaro e uno scuro, scelti dai due gruppi del menu,
  e si passa dall'uno all'altro con il sistema operativo. Disattivando l'opzione, il tema scelto resta fisso.
- Temi inclusi: **Chiaro**, **Carta** (seppia, caratteri con grazie), **Scuro**, **Formal Dark Pro**.
- Se un tema non colora i token del codice, MarkType applica colori predefiniti (chiari o scuri secondo il tema),
  come fa Typora con gli stili base di CodeMirror.
- Barra del titolo, menu, schede e barra di stato (che in Typora sono nativi) mantengono il font dell'interfaccia
  anche se il tema cambia il font di `body`.

## Variabili CSS supportate

Le stesse di Typora, tra cui:
`--bg-color`, `--text-color`, `--primary-color`, `--side-bar-bg-color`, `--side-bar-text-color`,
`--control-text-color`, `--control-text-hover-color`, `--item-hover-bg-color`, `--item-hover-text-color`,
`--active-file-bg-color`, `--active-file-text-color`, `--active-file-border-color`, `--window-border`,
`--select-text-bg-color`, `--select-text-font-color`, `--meta-content-color`, `--monospace`,
`--code-block-bg-color`, `--md-char-color`, `--heading-char-color`, `--blur-text-color`,
`--search-hit-bg-color`, `--search-select-bg-color`, `--rawblock-edit-panel-bd`, `--base-font-size`.

I temi possono definirne altre per uso interno (come fa Formal Dark Pro con `--code-bg`, `--link-color`, …).

## Selettori principali

| Elemento | Selettore |
|---|---|
| Area del documento | `#write` |
| Blocco attivo | `.md-focus` |
| Marcatori di sintassi visibili | `.md-meta`, `.md-before`, `.md-after`, `.md-expand` |
| Blocco di codice | `pre.md-fences`, `.CodeMirror`, `.cm-s-inner .cm-keyword` / `.cm-string` / `.cm-comment` / … |
| Codice inline | `#write code` |
| Matematica | `.md-math-block`, `.MathJax_SVG` (alias per KaTeX: `.katex`) |
| Diagrammi | `.md-diagram-panel`, `.md-mermaid` |
| Task list | `.md-task-list-item`, `.task-list-item input` |
| Alert GitHub | `.md-alert`, `.md-alert-note`, `.md-alert-warning`, … |
| Indice `[toc]` | `.md-toc`, `.md-toc-item`, `.md-toc-h1` … `.md-toc-h6` |
| Front matter | `pre.md-meta-block` |
| Modalità sorgente | `#typora-source`, `.CodeMirror` |
| Sidebar | `#typora-sidebar`, `.sidebar-tabs`, `.sidebar-content` |
| Albero file | `#file-library-tree`, `.file-tree-node`, `.file-node-content`, `.file-node-title`, `.active` |
| Lista file | `.file-list-item`, `.file-list-item.active` |
| Indice nella sidebar | `#outline-content`, `.outline-item`, `.outline-h1` … `.outline-h6`, `.outline-item-active` |
| Classe OS su `body` | `.os-windows`, `.os-macos`, `.os-linux` |

Elementi propri di MarkType (barra del titolo, schede, barra di stato) usano il prefisso `#mt-` / `.mt-` e si colorano
con le variabili sopra, quindi seguono anche i temi Typora che non li conoscono.

## Limiti noti

- La versione web offre solo i temi inclusi (non c'è una cartella temi).
- L'elemento `content` di Typora non esiste: le regole su `content` vengono ignorate (di solito impostano solo lo sfondo,
  che MarkType prende già da `--bg-color`).

I selettori di elementi di Typora che MarkType non ha (es. `.megamenu-*`, `.ty-preferences`, dialog interni)
vengono semplicemente ignorati.
