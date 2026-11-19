import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView, type NodeView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { tableEditing } from 'prosemirror-tables';
import { schema } from '../schema.ts';
import type { MarkdownStyle } from '../markdown/processor.ts';
import { buildInputRules } from './inputrules.ts';
import { buildKeymaps } from './keymap.ts';
import { seamlessPlugin } from './seamless.ts';

export interface WysiwygViewOptions {
  style: MarkdownStyle;
  editable: boolean;
  resolveUrl(src: string): string;
  openLink(href: string): void;
  onEditLink?(view: EditorView, from: number, to: number): void;
  onUpdate?(view: EditorView, docChanged: boolean): void;
}

class ImageView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;

  constructor(
    private node: PMNode,
    private resolveUrl: (src: string) => string,
  ) {
    this.dom = document.createElement('span');
    this.dom.className = 'md-image';
    this.img = document.createElement('img');
    this.img.draggable = false;
    this.img.addEventListener('load', () => this.dom.classList.add('md-img-loaded'));
    this.img.addEventListener('error', () => this.dom.classList.add('md-img-error'));
    this.dom.appendChild(this.img);
    this.render();
  }

  private render() {
    const { src, alt, title } = this.node.attrs as { src: string; alt: string; title: string | null };
    this.dom.classList.remove('md-img-loaded', 'md-img-error');
    this.img.src = this.resolveUrl(src);
    this.img.dataset.src = src;
    this.img.alt = alt;
    if (title) this.img.title = title;
    else this.img.removeAttribute('title');
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const changed =
      node.attrs.src !== this.node.attrs.src ||
      node.attrs.alt !== this.node.attrs.alt ||
      node.attrs.title !== this.node.attrs.title;
    this.node = node;
    if (changed) this.render();
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

/** Task checkboxes toggle on click; Ctrl/Cmd+click opens links. */
function clickPlugin(options: WysiwygViewOptions): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target as HTMLElement;
          if (!(target instanceof HTMLInputElement) || !target.classList.contains('task-list-item-checkbox'))
            return false;
          event.preventDefault();
          if (!view.editable) return true;
          const li = target.closest('li');
          if (!li) return true;
          const $pos = view.state.doc.resolve(view.posAtDOM(li, 0));
          for (let depth = $pos.depth; depth > 0; depth--) {
            const node = $pos.node(depth);
            if (node.type === schema.nodes.list_item) {
              view.dispatch(
                view.state.tr.setNodeMarkup($pos.before(depth), null, {
                  ...node.attrs,
                  checked: !node.attrs.checked,
                }),
              );
              break;
            }
          }
          return true;
        },
      },
      handleClick(view, pos, event) {
        if (!(event.ctrlKey || event.metaKey) && view.editable) return false;
        const $pos = view.state.doc.resolve(pos);
        const link =
          schema.marks.link!.isInSet($pos.marks()) ?? schema.marks.link!.isInSet($pos.nodeAfter?.marks ?? []);
        if (!link) return false;
        options.openLink(link.attrs.href as string);
        return true;
      },
    },
  });
}

export function createWysiwygState(doc: PMNode, options: WysiwygViewOptions): EditorState {
  if (!options.editable) return EditorState.create({ doc, plugins: [clickPlugin(options)] });
  return EditorState.create({
    doc,
    plugins: [
      buildInputRules(schema),
      ...buildKeymaps(schema),
      history(),
      dropCursor(),
      gapCursor(),
      tableEditing(),
      seamlessPlugin({ style: options.style, onEditLink: options.onEditLink }),
      clickPlugin(options),
    ],
  });
}

export function createWysiwygView(parent: HTMLElement, doc: PMNode, options: WysiwygViewOptions): EditorView {
  const view: EditorView = new EditorView(parent, {
    state: createWysiwygState(doc, options),
    editable: () => options.editable,
    // Only one #write exists at a time: the editor, or the preview in split view.
    attributes: {
      id: 'write',
      class: options.editable ? 'mt-write is-node' : 'mt-write mt-preview',
      spellcheck: 'false',
    },
    nodeViews: {
      image: (node) => new ImageView(node, options.resolveUrl),
    },
    dispatchTransaction(tr) {
      const state = view.state.apply(tr);
      view.updateState(state);
      options.onUpdate?.(view, tr.docChanged);
    },
  });
  return view;
}
