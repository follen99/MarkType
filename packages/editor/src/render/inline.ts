import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { getEmoji, getKatex, loadEmoji, loadKatex, renderTex } from './lazy.ts';

/**
 * Inline math (`$x^2$`) and emoji shortcodes (`:smile:`) are shown rendered; the source reappears as
 * soon as the cursor touches them (like Typora).
 */

interface Candidate {
  from: number;
  to: number;
  kind: 'math' | 'emoji';
  value: string;
}

const EMOJI = /:([a-z0-9_+-]+):/g;
const key = new PluginKey<{ candidates: Candidate[]; decorations: DecorationSet }>('mt-inline-render');

function scan(doc: PMNode, onLoad: () => void): Candidate[] {
  const out: Candidate[] = [];
  const katex = getKatex();
  const emoji = getEmoji();
  let wantKatex = false;
  let wantEmoji = false;

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    let run: Candidate | null = null;
    node.forEach((child, offset) => {
      const from = pos + 1 + offset;
      const raw = child.marks.find((m) => m.type.name === 'raw');
      const isMath = !!raw && raw.attrs.kind === 'math' && child.isText;
      if (isMath) {
        if (run && run.to === from) {
          run.to += child.nodeSize;
          run.value += child.text!;
        } else {
          run = { from, to: from + child.nodeSize, kind: 'math', value: child.text! };
          out.push(run);
        }
        return;
      }
      run = null;
      if (!child.isText || raw || child.marks.some((m) => m.type.name === 'code')) return;
      for (const m of child.text!.matchAll(EMOJI)) {
        if (!emoji) {
          wantEmoji = true;
          break;
        }
        const char = emoji[m[1]!];
        if (char)
          out.push({ from: from + m.index, to: from + m.index + m[0].length, kind: 'emoji', value: char });
      }
    });
    return false;
  });

  if (out.some((c) => c.kind === 'math') && !katex) wantKatex = true;
  if (wantKatex) void loadKatex().then(onLoad);
  if (wantEmoji) void loadEmoji().then(onLoad);
  return katex ? out : out.filter((c) => c.kind !== 'math');
}

function render(candidate: Candidate): HTMLElement {
  const el = document.createElement('span');
  el.contentEditable = 'false';
  el.dataset.from = String(candidate.from);
  if (candidate.kind === 'emoji') {
    el.className = 'md-emoji';
    el.textContent = candidate.value;
  } else {
    el.className = 'md-inline-math';
    const tex = candidate.value.replace(/^\$+/, '').replace(/\$+$/, '');
    el.innerHTML = renderTex(getKatex()!, tex, false);
  }
  return el;
}

function build(state: EditorState, candidates: Candidate[]): DecorationSet {
  const { from, to } = state.selection;
  const decorations: Decoration[] = [];
  for (const c of candidates) {
    // The cursor touches the source: show it, for editing.
    if (from <= c.to && to >= c.from) continue;
    decorations.push(
      Decoration.inline(c.from, c.to, { class: 'md-hidden-source' }),
      Decoration.widget(c.from, () => render(c), {
        side: -1,
        key: `${c.kind}:${c.value}`,
        ignoreSelection: true,
      }),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

export function inlineRenderPlugin(): Plugin {
  let refresh = () => {};
  return new Plugin({
    key,
    state: {
      init(_config, state) {
        const candidates = scan(state.doc, () => refresh());
        return { candidates, decorations: build(state, candidates) };
      },
      apply(tr, value, _old, state) {
        if (!tr.docChanged && !tr.selectionSet && !tr.getMeta(key)) return value;
        const candidates =
          tr.docChanged || tr.getMeta(key) ? scan(state.doc, () => refresh()) : value.candidates;
        return { candidates, decorations: build(state, candidates) };
      },
    },
    view(view) {
      refresh = () => {
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true));
      };
      return {};
    },
    props: {
      decorations: (state) => key.getState(state)?.decorations,
      handleDOMEvents: {
        mousedown(view: EditorView, event) {
          const target = (event.target as HTMLElement).closest?.(
            '.md-inline-math, .md-emoji',
          ) as HTMLElement | null;
          if (!target || !view.editable) return false;
          event.preventDefault();
          const pos = Number(target.dataset.from) + 1;
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
          view.focus();
          return true;
        },
      },
    },
  });
}
