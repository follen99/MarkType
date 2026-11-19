import { Plugin, PluginKey, NodeSelection, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import type { MarkdownStyle } from '../markdown/processor.ts';
import { markRunAt } from './marks.ts';

/**
 * Typora "seamless" mode: the document is rendered, and the markdown syntax of the inline element under
 * the cursor appears around it (`.md-meta`). The block holding the cursor gets `.md-focus`.
 */

export interface SeamlessOptions {
  style: MarkdownStyle;
  /** Called when the user clicks the `](url)` part of a link. */
  onEditLink?: (view: EditorView, from: number, to: number) => void;
}

export const seamlessKey = new PluginKey<DecorationSet>('mt-seamless');

function delimiters(style: MarkdownStyle): Record<string, [string, string]> {
  const em = style.emphasis;
  const strong = style.strong.repeat(2);
  return {
    strong: [strong, strong],
    em: [em, em],
    code: ['`', '`'],
    strike: ['~~', '~~'],
    underline: ['<u>', '</u>'],
  };
}

function meta(text: string, extraClass = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = `md-meta md-before-after ${extraClass}`.trim();
  span.textContent = text;
  return span;
}

function linkTail(href: string, title: string | null): string {
  return `](${href}${title ? ` "${title}"` : ''})`;
}

function buildDecorations(state: EditorState, options: SeamlessOptions): DecorationSet {
  const { selection, doc, schema } = state;
  const decorations: Decoration[] = [];

  if (selection instanceof NodeSelection) {
    const node = selection.node;
    if (node.type === schema.nodes.image) {
      const source = `![${node.attrs.alt}${linkTail(node.attrs.src as string, node.attrs.title as string | null)}`;
      decorations.push(
        Decoration.widget(selection.to, () => meta(source, 'md-image-src'), { side: 1, key: 'img-src' }),
      );
    }
    return DecorationSet.create(doc, decorations);
  }

  const $head = selection.$head;

  // Focused block (innermost textblock) and its top-level container.
  if ($head.depth > 0 && $head.parent.isTextblock) {
    decorations.push(Decoration.node($head.before(), $head.after(), { class: 'md-focus' }));
    if ($head.depth > 1) {
      decorations.push(Decoration.node($head.before(1), $head.after(1), { class: 'md-focus-container' }));
    }
  }

  if (!$head.parent.type.spec.code) {
    const delims = delimiters(options.style);
    const markTypes = Object.values(schema.marks);
    markTypes.forEach((type, rank) => {
      const run = markRunAt($head, type);
      if (!run) return;
      let open: string;
      let close: string;
      let closeClass = '';
      if (type === schema.marks.link) {
        open = '[';
        close = linkTail(run.mark.attrs.href as string, run.mark.attrs.title as string | null);
        closeClass = 'md-link-meta';
      } else {
        const d = delims[type.name];
        if (!d) return;
        [open, close] = d;
      }
      const key = `${type.name}-${run.from}-${run.to}-${close}`;
      decorations.push(
        Decoration.widget(run.from, () => meta(open), { side: -100 + rank, key: `${key}-open` }),
        Decoration.widget(
          run.to,
          () => {
            const el = meta(close, closeClass);
            el.dataset.from = String(run.from);
            el.dataset.to = String(run.to);
            return el;
          },
          { side: 100 - rank, key: `${key}-close` },
        ),
      );
    });
  }

  return DecorationSet.create(doc, decorations);
}

export function seamlessPlugin(options: SeamlessOptions): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: seamlessKey,
    state: {
      init: (_config, state) => buildDecorations(state, options),
      apply: (tr, value, _old, state) =>
        tr.docChanged || tr.selectionSet ? buildDecorations(state, options) : value,
    },
    props: {
      decorations: (state) => seamlessKey.getState(state),
      handleDOMEvents: {
        mousedown: (view, event) => {
          const target = event.target as HTMLElement | null;
          const meta = target?.closest?.('.md-link-meta') as HTMLElement | null;
          if (!meta || !options.onEditLink) return false;
          event.preventDefault();
          options.onEditLink(view, Number(meta.dataset.from), Number(meta.dataset.to));
          return true;
        },
      },
    },
  });
}
