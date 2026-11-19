import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { hasScheme } from './url.ts';
import { getKatex, loadKatex, loadPurify, renderMermaid, renderTex } from './lazy.ts';

export interface BlockViewEnv {
  resolveUrl(src: string): string;
}

const RENDER_DELAY = 250;

type PreviewKind = 'mermaid' | 'math' | 'html';

/** Renders a preview into `target`. Returns a cleanup-free promise; errors become a message. */
async function renderPreview(kind: PreviewKind, source: string, target: HTMLElement, env: BlockViewEnv) {
  if (!source.trim()) {
    target.replaceChildren();
    target.classList.add('md-preview-empty');
    return;
  }
  target.classList.remove('md-preview-empty', 'md-preview-error');
  // Previews live inside <pre>: use the document font, not the code font.
  const write = target.closest('#write');
  if (write) target.style.fontFamily = getComputedStyle(write).fontFamily;
  try {
    if (kind === 'mermaid') {
      target.innerHTML = await renderMermaid(source);
    } else if (kind === 'math') {
      const katex = getKatex() ?? (await loadKatex());
      const tex = source.replace(/^\s*\$\$/, '').replace(/\$\$\s*$/, '');
      target.innerHTML = renderTex(katex, tex, true);
    } else {
      const purify = await loadPurify();
      target.innerHTML = purify.sanitize(source, { USE_PROFILES: { html: true } });
      // Relative images in HTML blocks are relative to the document, like markdown images.
      for (const img of target.querySelectorAll('img')) {
        const src = img.getAttribute('src');
        if (src && !hasScheme(src)) img.src = env.resolveUrl(src);
      }
      // Links in a preview must not navigate the app window.
      for (const a of target.querySelectorAll('a')) a.removeAttribute('href');
    }
  } catch (error) {
    target.classList.add('md-preview-error');
    target.textContent = error instanceof Error ? error.message.split('\n')[0]! : String(error);
  }
}

/**
 * A text block whose source is hidden behind a rendered preview while the cursor is elsewhere
 * (Typora's behavior for diagrams, math blocks and HTML). Clicking the preview edits the source.
 */
abstract class PreviewBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  protected preview: HTMLElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private rendered = '';

  constructor(
    protected node: PMNode,
    protected view: EditorView,
    protected getPos: () => number | undefined,
    protected env: BlockViewEnv,
  ) {
    this.dom = document.createElement('pre');
    this.dom.spellcheck = false;
    this.contentDOM = document.createElement('code');
    this.dom.appendChild(this.contentDOM);
  }

  protected abstract previewKind(): PreviewKind | null;

  protected setupPreview(): void {
    const kind = this.previewKind();
    this.dom.classList.toggle('md-has-preview', !!kind);
    if (!kind) {
      this.preview?.remove();
      this.preview = null;
      return;
    }
    if (!this.preview) {
      this.preview = document.createElement('div');
      this.preview.className = `md-preview md-preview-${kind}${kind === 'mermaid' ? ' md-diagram-panel' : ''}`;
      this.preview.contentEditable = 'false';
      this.preview.addEventListener('mousedown', (event) => {
        if (!this.view.editable) return;
        event.preventDefault();
        const pos = this.getPos();
        if (pos === undefined) return;
        const { state } = this.view;
        this.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + 1)));
        this.view.focus();
      });
      this.dom.appendChild(this.preview);
    }
    this.schedule(0);
  }

  private schedule(delay: number): void {
    const kind = this.previewKind();
    const source = this.node.textContent;
    if (!kind || !this.preview || source === this.rendered) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.rendered = source;
      if (this.preview) void renderPreview(kind, source, this.preview, this.env);
    }, delay);
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const before = this.previewKind();
    this.node = node;
    if (this.previewKind() !== before) {
      this.rendered = '';
      this.setupPreview();
    } else {
      this.schedule(RENDER_DELAY);
    }
    this.updateAttributes();
    return true;
  }

  protected abstract updateAttributes(): void;

  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    if (mutation.type === 'selection') return false;
    return !this.contentDOM.contains(mutation.target);
  }

  stopEvent(event: Event): boolean {
    return !!this.preview?.contains(event.target as Node) && event.type !== 'mousedown';
  }

  destroy(): void {
    clearTimeout(this.timer);
  }
}

const DIAGRAM_LANGUAGES = new Set(['mermaid']);

/** Fenced code: syntax-highlighted text, editable language label, diagram preview for mermaid. */
export class CodeBlockView extends PreviewBlockView {
  private label: HTMLInputElement;

  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined, env: BlockViewEnv) {
    super(node, view, getPos, env);
    this.label = document.createElement('input');
    this.label.className = 'md-fences-lang';
    this.label.type = 'text';
    this.label.spellcheck = false;
    this.label.placeholder = 'lang';
    this.label.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        if (event.key === 'Escape') this.label.value = this.node.attrs.language as string;
        this.commitLanguage();
        this.focusCode();
      }
    });
    this.label.addEventListener('blur', () => this.commitLanguage());
    const wrapper = document.createElement('span');
    wrapper.className = 'md-fences-lang-wrap';
    wrapper.contentEditable = 'false';
    wrapper.appendChild(this.label);
    this.dom.appendChild(wrapper);
    this.updateAttributes();
    this.setupPreview();
  }

  protected previewKind(): PreviewKind | null {
    return DIAGRAM_LANGUAGES.has((this.node.attrs.language as string).toLowerCase()) ? 'mermaid' : null;
  }

  protected updateAttributes(): void {
    const language = this.node.attrs.language as string;
    const diagram = !!this.previewKind();
    // classList, not className: ProseMirror adds decoration classes (md-focus) to this element.
    this.dom.classList.add('md-fences', 'md-end-block', 'cm-s-inner');
    this.dom.classList.toggle('md-diagram', diagram);
    this.dom.classList.toggle('md-fences-advanced', diagram);
    this.dom.classList.toggle('md-has-preview', diagram);
    if (language) this.dom.setAttribute('lang', language);
    else this.dom.removeAttribute('lang');
    if (document.activeElement !== this.label) this.label.value = language;
    this.label.readOnly = !this.view.editable;
  }

  private commitLanguage(): void {
    const value = this.label.value.trim();
    const pos = this.getPos();
    if (pos === undefined || value === this.node.attrs.language || !this.view.editable) return;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, language: value }),
    );
  }

  private focusCode(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const { state } = this.view;
    this.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + 1)));
    this.view.focus();
  }

  override stopEvent(event: Event): boolean {
    return this.label.contains(event.target as Node) || super.stopEvent(event);
  }
}

const RAW_CLASS: Record<string, string> = {
  html: 'md-htmlblock md-rawblock',
  frontmatter: 'md-meta-block md-rawblock',
  math: 'md-math-block md-rawblock',
  footnote: 'md-def-footnote md-rawblock',
  markdown: 'md-rawblock md-raw-markdown',
};

/** Raw source blocks; math and HTML get a rendered preview. */
export class RawBlockView extends PreviewBlockView {
  constructor(node: PMNode, view: EditorView, getPos: () => number | undefined, env: BlockViewEnv) {
    super(node, view, getPos, env);
    this.updateAttributes();
    this.setupPreview();
  }

  protected previewKind(): PreviewKind | null {
    const kind = this.node.attrs.kind as string;
    return kind === 'math' || kind === 'html' ? kind : null;
  }

  protected updateAttributes(): void {
    const kind = this.node.attrs.kind as string;
    // classList, not className: ProseMirror adds decoration classes (md-focus) to this element.
    for (const cls of Object.values(RAW_CLASS).flatMap((c) => c.split(' '))) this.dom.classList.remove(cls);
    this.dom.classList.add(...(RAW_CLASS[kind] ?? RAW_CLASS.markdown!).split(' '));
    this.dom.classList.toggle('md-has-preview', !!this.previewKind());
    this.dom.dataset.kind = kind;
  }
}
