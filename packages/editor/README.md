# @marktype/editor

Editing engine:

- ProseMirror schema and node views that emit Typora-compatible DOM (`#write`, `.md-fences`, …);
- mdast ↔ ProseMirror bridge (unified/remark), with configurable serialization style;
- seamless mode (markers visible at the cursor, `.md-focus`), input rules, Typora keymap;
- source mode and split view (CodeMirror 6);
- `test/fixtures/`: markdown round-trip fixtures.

## Prova editor

Questo testo è stato scritto dall'editor

**Questo testo è in grassetto**

*questo è in italic*

```
questo è un codice
```
