import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView as PMView } from 'prosemirror-view';
import type { EditorView as CMView } from '@codemirror/view';
import type { EditorCommandId } from './commands.ts';
import { defaultMarkdownStyle, type MarkdownStyle } from './markdown/processor.ts';
import { parseMarkdown, topLevelLines } from './markdown/parse.ts';
import { serializeMarkdown } from './markdown/serialize.ts';
import { computeStats, type TextStats } from './stats.ts';
import { createWysiwygView } from './wysiwyg/view.ts';
import { editLinkAt, runWysiwygCommand } from './wysiwyg/commands.ts';
import { createSourceView, runSourceCommand } from './source/view.ts';

export type EditorMode = 'wysiwyg' | 'source' | 'split';

export interface EditorStatus extends TextStats {
  mode: EditorMode;
  /** 1-based cursor position, only in source/split mode. */
  cursor: { line: number; column: number } | null;
}

export interface EditorHostOptions {
  /** Markdown with `\n` line endings. */
  markdown: string;
  mode?: EditorMode;
  style?: MarkdownStyle;
  resolveUrl(src: string): string;
  openLink(href: string): void;
  prompt(kind: 'link' | 'image', initial: string): Promise<string | null>;
  /** Any content change (cheap, called on every edit). */
  onChange?(): void;
  /** Debounced status (word count, cursor…). */
  onStatus?(status: EditorStatus): void;
}

const STATUS_DELAY = 250;

/**
 * Owns the editing surfaces of one document and switches between WYSIWYG, source and split view.
 *
 * The file text loaded from disk is the reference ("clean source"). Until the user edits in WYSIWYG mode
 * the document is never re-serialized, so opening or saving an untouched file never reformats it, and
 * source mode shows the file exactly as written.
 */
export class EditorHost {
  readonly dom: HTMLElement;
  private options: EditorHostOptions;
  private style: MarkdownStyle;
  private _mode: EditorMode;
  private cleanSource: string;
  private cleanDoc: PMNode;
  private wysiwyg: PMView | null = null;
  private source: CMView | null = null;
  private preview: PMView | null = null;
  private previewLines: number[] = [];
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private syncingScroll = false;

  constructor(parent: HTMLElement, options: EditorHostOptions) {
    this.options = options;
    this.style = options.style ?? defaultMarkdownStyle;
    this.cleanSource = options.markdown;
    this.cleanDoc = parseMarkdown(options.markdown);
    this._mode = options.mode ?? 'wysiwyg';
    this.dom = document.createElement('div');
    this.dom.className = 'mt-editor';
    parent.appendChild(this.dom);
    this.mount(this._mode, this.cleanDoc, this.cleanSource);
  }

  get mode(): EditorMode {
    return this._mode;
  }

  // ---------- content ----------

  /** Current markdown (`\n` line endings). */
  getMarkdown(): string {
    if (this.source) return this.source.state.doc.toString();
    const doc = this.wysiwyg!.state.doc;
    return doc.eq(this.cleanDoc) ? this.cleanSource : serializeMarkdown(doc, this.style);
  }

  isDirty(): boolean {
    if (this.source) return this.source.state.doc.toString() !== this.cleanSource;
    return !this.wysiwyg!.state.doc.eq(this.cleanDoc);
  }

  /** Marks the current content as saved. `savedText` is what was written to disk. */
  markClean(savedText = this.getMarkdown()): void {
    this.cleanSource = savedText;
    this.cleanDoc = this.wysiwyg ? this.wysiwyg.state.doc : parseMarkdown(savedText);
  }

  // ---------- modes ----------

  setMode(mode: EditorMode): void {
    if (mode === this._mode) return;
    const text = this.getMarkdown();
    const doc = this.wysiwyg?.state.doc ?? (text === this.cleanSource ? this.cleanDoc : parseMarkdown(text));
    this.unmount();
    this._mode = mode;
    this.mount(mode, doc, text);
    this.focus();
  }

  private mount(mode: EditorMode, doc: PMNode, text: string): void {
    this.dom.dataset.mode = mode;
    if (mode === 'wysiwyg') {
      const pane = this.pane('mt-wysiwyg-pane');
      this.wysiwyg = createWysiwygView(pane, doc, {
        style: this.style,
        editable: true,
        resolveUrl: this.options.resolveUrl,
        openLink: this.options.openLink,
        onEditLink: (view, from, to) => void editLinkAt(view, this.options, from, to),
        onUpdate: (_view, docChanged) => {
          if (docChanged) this.options.onChange?.();
          this.scheduleStatus();
        },
      });
    } else {
      const sourcePane = this.pane('mt-source-pane');
      sourcePane.id = 'typora-source';
      this.source = createSourceView(sourcePane, text, {
        prompt: this.options.prompt,
        onUpdate: (update) => {
          if (update.docChanged) {
            this.options.onChange?.();
            if (this.preview) this.schedulePreview();
          }
          if (update.docChanged || update.selectionSet) this.scheduleStatus();
        },
      });
      this.source.dom.classList.add('CodeMirror', 'cm-s-inner');
      if (mode === 'split') {
        const previewPane = this.pane('mt-preview-pane');
        this.preview = createWysiwygView(previewPane, doc, {
          style: this.style,
          editable: false,
          resolveUrl: this.options.resolveUrl,
          openLink: this.options.openLink,
        });
        this.previewLines = topLevelLines(text);
        this.source.scrollDOM.addEventListener('scroll', this.onSourceScroll, { passive: true });
      }
    }
    this.scheduleStatus(0);
  }

  private pane(className: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `mt-pane ${className}`;
    this.dom.appendChild(el);
    return el;
  }

  private unmount(): void {
    clearTimeout(this.previewTimer);
    this.source?.scrollDOM.removeEventListener('scroll', this.onSourceScroll);
    this.wysiwyg?.destroy();
    this.source?.destroy();
    this.preview?.destroy();
    this.wysiwyg = this.source = this.preview = null;
    this.dom.replaceChildren();
  }

  // ---------- split view ----------

  private schedulePreview(): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      if (!this.preview || !this.source) return;
      const text = this.source.state.doc.toString();
      const doc = parseMarkdown(text);
      const { state } = this.preview;
      this.preview.updateState(state.apply(state.tr.replaceWith(0, state.doc.content.size, doc.content)));
      this.previewLines = topLevelLines(text);
      this.onSourceScroll();
    }, 150);
  }

  /** Scrolls the preview so the block at the top of the source view is at the top of the preview. */
  private onSourceScroll = (): void => {
    if (!this.source || !this.preview || this.syncingScroll) return;
    const scroller = this.source.scrollDOM;
    const topBlock = this.source.lineBlockAtHeight(scroller.scrollTop);
    const topLine = this.source.state.doc.lineAt(topBlock.from).number - 1;
    let index = 0;
    while (index + 1 < this.previewLines.length && this.previewLines[index + 1]! <= topLine) index++;
    const target = this.preview.dom.children[index] as HTMLElement | undefined;
    const previewPane = this.preview.dom.parentElement!;
    if (!target) return;
    // Interpolate inside the block for smooth scrolling.
    const blockStart = this.previewLines[index] ?? 0;
    const blockEnd = this.previewLines[index + 1] ?? this.source.state.doc.lines;
    const fraction = blockEnd > blockStart ? (topLine - blockStart) / (blockEnd - blockStart) : 0;
    // .mt-pane is position: relative, so offsetTop is relative to the preview pane.
    const top = target.offsetTop + fraction * target.offsetHeight;
    this.syncingScroll = true;
    previewPane.scrollTop = scroller.scrollTop <= 0 ? 0 : top;
    requestAnimationFrame(() => (this.syncingScroll = false));
  };

  // ---------- commands & status ----------

  exec(id: EditorCommandId): boolean {
    if (this.wysiwyg) return runWysiwygCommand(this.wysiwyg, id, this.options);
    if (this.source) return runSourceCommand(this.source, id, this.options);
    return false;
  }

  focus(): void {
    (this.wysiwyg ?? this.source)?.focus();
  }

  private scheduleStatus(delay = STATUS_DELAY): void {
    if (!this.options.onStatus) return;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.options.onStatus?.(this.status()), delay);
  }

  status(): EditorStatus {
    if (this.source) {
      const state = this.source.state;
      const head = state.selection.main.head;
      const line = state.doc.lineAt(head);
      const text = state.doc.toString();
      // The trailing newline of a file does not start a new line.
      const lines = state.doc.length === 0 ? 0 : state.doc.lines - (text.endsWith('\n') ? 1 : 0);
      return {
        ...computeStats(text.replace(/[#*_`~>|[\]()!-]/g, ' '), lines),
        mode: this._mode,
        cursor: { line: line.number, column: head - line.from + 1 },
      };
    }
    const doc = this.wysiwyg!.state.doc;
    const plain = doc.textBetween(0, doc.content.size, '\n', ' ');
    const markdown = this.getMarkdown();
    const lines = markdown ? markdown.replace(/\n$/, '').split('\n').length : 0;
    return { ...computeStats(plain, lines), mode: this._mode, cursor: null };
  }

  destroy(): void {
    clearTimeout(this.statusTimer);
    this.unmount();
    this.dom.remove();
  }
}
