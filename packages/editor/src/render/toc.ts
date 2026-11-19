import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';

interface Heading {
  level: number;
  text: string;
  pos: number;
}

function headings(doc: PMNode): Heading[] {
  const out: Heading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({ level: node.attrs.level as number, text: node.textContent, pos });
      return false;
    }
    return node.isBlock && !node.isTextblock;
  });
  return out;
}

/** `[toc]` block: a live list of the document headings (Typora DOM: .md-toc-item.md-toc-hN). */
class TocView implements NodeView {
  dom: HTMLElement;
  private signature = '';

  constructor(
    private view: EditorView,
    private registry: Set<TocView>,
  ) {
    this.dom = document.createElement('div');
    this.dom.className = 'md-toc md-toc-content';
    this.dom.contentEditable = 'false';
    this.dom.addEventListener('mousedown', (event) => {
      const item = (event.target as HTMLElement).closest('[data-pos]') as HTMLElement | null;
      if (!item) return;
      event.preventDefault();
      const pos = Number(item.dataset.pos);
      const { state } = this.view;
      this.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 1))));
      (this.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      this.view.focus();
    });
    registry.add(this);
    this.render();
  }

  render(): void {
    const list = headings(this.view.state.doc);
    const signature = list.map((h) => `${h.level}:${h.pos}:${h.text}`).join('\n');
    if (signature === this.signature) return;
    this.signature = signature;
    const min = Math.min(6, ...list.map((h) => h.level));
    this.dom.replaceChildren(
      ...list.map((h) => {
        const item = document.createElement('p');
        item.className = `md-toc-item md-toc-h${h.level}`;
        item.style.setProperty('--mt-toc-depth', String(h.level - min));
        const link = document.createElement('a');
        link.className = 'md-toc-inner';
        link.textContent = h.text || '—';
        item.dataset.pos = String(h.pos);
        item.appendChild(link);
        return item;
      }),
    );
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'md-toc-item md-toc-empty';
      empty.textContent = '[TOC]';
      this.dom.appendChild(empty);
    }
  }

  update(node: PMNode): boolean {
    return node.type.name === 'toc';
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.registry.delete(this);
  }
}

/** Node view factory + plugin that refreshes every `[toc]` when the headings change. */
export function tocSupport() {
  const registry = new Set<TocView>();
  return {
    nodeView: (view: EditorView) => new TocView(view, registry),
    plugin: new Plugin({
      view: () => ({
        update(view, previous) {
          if (registry.size && !view.state.doc.eq(previous.doc)) for (const toc of registry) toc.render();
        },
      }),
    }),
  };
}
