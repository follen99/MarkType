import type { Node as PMNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView as PMView } from 'prosemirror-view';
import type { EditorView as CMView } from '@codemirror/view';
import type { EditorCommandId } from './commands.ts';
import { pmFind, pmSetFind, type FindAction, type FindQuery, type FindResult } from './find.ts';
import { defaultMarkdownStyle, type MarkdownStyle } from './markdown/processor.ts';
import { parseMarkdown, topLevelLines } from './markdown/parse.ts';
import { serializeMarkdown } from './markdown/serialize.ts';
import { computeStats, type TextStats } from './stats.ts';
import { createWysiwygView } from './wysiwyg/view.ts';
import { editLinkAt, runWysiwygCommand } from './wysiwyg/commands.ts';
import { KEEP_IMAGES_META } from './wysiwyg/removedimages.ts';

type SourceModule = typeof import('./source/lazy.ts');
let sourceModule: SourceModule | null = null;
let sourceLoading: Promise<SourceModule> | null = null;

/** Loads CodeMirror (source mode) once; WYSIWYG-only sessions never download it. */
export function loadSourceEditor(): Promise<SourceModule> {
  sourceLoading ??= import('./source/lazy.ts').then((module) => (sourceModule = module));
  return sourceLoading;
}

/** The source module; only called while a source view exists, so it is loaded. */
const cm = (): SourceModule => sourceModule!;
import { insertImageNodes, type ImageRef, type SaveImage } from './wysiwyg/clipboard.ts';

export type EditorMode = 'wysiwyg' | 'source' | 'split';

export interface EditorStatus extends TextStats {
  mode: EditorMode;
  /** 1-based cursor position, only in source/split mode. */
  cursor: { line: number; column: number } | null;
}

export interface OutlineItem {
  level: number;
  text: string;
}

export interface EditorHostOptions {
  /** Markdown with `\n` line endings. */
  markdown: string;
  /**
   * The saved version of the document, when it differs from `markdown` (a recovered draft).
   * Defaults to `markdown`.
   */
  savedMarkdown?: string;
  mode?: EditorMode;
  style?: MarkdownStyle;
  resolveUrl(src: string): string;
  openLink(href: string): void;
  prompt(kind: 'link' | 'image', initial: string): Promise<string | null>;
  /** Stores an image file pasted or dropped in the editor; resolves to its markdown reference. */
  saveImage?: SaveImage;
  /** Any content change (cheap, called on every edit). */
  onChange?(): void;
  /** Debounced status (word count, cursor…). */
  onStatus?(status: EditorStatus): void;
  /** Debounced list of headings. */
  onOutline?(outline: OutlineItem[]): void;
  /** Index in the outline of the heading at the top of the viewport (-1 before the first heading). */
  onActiveHeading?(index: number): void;
  /**
   * The user deleted these images (their `src`) from the text in WYSIWYG mode. Not called for cut, drag
   * and drop, undo/redo or source mode.
   */
  onImagesRemoved?(srcs: string[]): void;
}

export type { FindQuery, FindResult, FindAction, ImageRef, SaveImage };

const STATUS_DELAY = 250;
/** Documents from this size (characters) get their line cache filled in the background. */
const LONG_DOCUMENT = 50_000;
/** Top-level blocks serialized per background step (~10 ms). */
const WARM_CHUNK = 150;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Headings of markdown source with their 0-based line, skipping fenced code. */
function sourceHeadings(text: string): (OutlineItem & { line: number })[] {
  const out: (OutlineItem & { line: number })[] = [];
  let fence: string | null = null;
  text.split('\n').forEach((line, index) => {
    const f = FENCE.exec(line);
    if (f) {
      if (!fence) fence = f[1]![0]!.repeat(f[1]!.length);
      else if (f[1]!.startsWith(fence)) fence = null;
      return;
    }
    if (fence) return;
    const m = ATX_HEADING.exec(line);
    if (m) out.push({ level: m[1]!.length, text: (m[2] ?? '').replace(/[*_`~]/g, ''), line: index });
  });
  return out;
}

/** Lines of markdown text, without the trailing newline of the file. */
function textLines(text: string): number {
  const trimmed = text.replace(/\n$/, '');
  return trimmed ? trimmed.split('\n').length : 0;
}

/** Headings of a document with their position. */
function docHeadings(doc: PMNode): (OutlineItem & { pos: number })[] {
  const out: (OutlineItem & { pos: number })[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({ level: node.attrs.level as number, text: node.textContent, pos });
      return false;
    }
    return node.isBlock && !node.isTextblock;
  });
  return out;
}

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
  private scrollFrame = 0;
  private syncingScroll = false;
  private findQuery: FindQuery | null = null;
  private lastActiveHeading = -2;
  /** Text shown in source mode while CodeMirror is still loading. */
  private pendingText: string | null = null;
  private mountToken = 0;
  private destroyed = false;
  private blockLines = new WeakMap<PMNode, number>();
  private warmTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement, options: EditorHostOptions) {
    this.options = options;
    this.style = options.style ?? defaultMarkdownStyle;
    this.cleanSource = options.savedMarkdown ?? options.markdown;
    this.cleanDoc = parseMarkdown(this.cleanSource);
    this._mode = options.mode ?? 'wysiwyg';
    this.dom = document.createElement('div');
    this.dom.className = 'mt-editor';
    parent.appendChild(this.dom);
    const doc = options.markdown === this.cleanSource ? this.cleanDoc : parseMarkdown(options.markdown);
    this.mount(this._mode, doc, options.markdown);
  }

  get mode(): EditorMode {
    return this._mode;
  }

  // ---------- content ----------

  /** Current markdown (`\n` line endings). */
  getMarkdown(): string {
    if (this.pendingText !== null) return this.pendingText;
    if (this.source) return this.source.state.doc.toString();
    const doc = this.wysiwyg!.state.doc;
    return doc.eq(this.cleanDoc) ? this.cleanSource : serializeMarkdown(doc, this.style);
  }

  isDirty(): boolean {
    if (this.pendingText !== null) return this.pendingText !== this.cleanSource;
    if (this.source) return this.source.state.doc.toString() !== this.cleanSource;
    return !this.wysiwyg!.state.doc.eq(this.cleanDoc);
  }

  /** True if the document has no content at all. */
  isEmpty(): boolean {
    if (this.pendingText !== null) return this.pendingText.length === 0;
    if (this.source) return this.source.state.doc.length === 0;
    const doc = this.wysiwyg!.state.doc;
    return doc.childCount === 1 && doc.firstChild!.isTextblock && doc.firstChild!.content.size === 0;
  }

  /** Marks the current content as saved. `savedText` is what was written to disk. */
  markClean(savedText = this.getMarkdown()): void {
    this.cleanSource = savedText;
    this.cleanDoc = this.wysiwyg ? this.wysiwyg.state.doc : parseMarkdown(savedText);
  }

  // ---------- images ----------

  /** Inserts images at a point of the window (a file drop) or, without it, at the cursor. */
  insertImages(images: ImageRef[], point?: { x: number; y: number }): void {
    if (this.source) {
      const pos = point ? (this.source.posAtCoords(point) ?? undefined) : undefined;
      cm().insertImageText(this.source, images, pos);
    } else if (this.wysiwyg) {
      const pos = point ? this.wysiwyg.posAtCoords({ left: point.x, top: point.y })?.pos : undefined;
      insertImageNodes(this.wysiwyg, images, pos);
    }
  }

  /** The `src` of every markdown image in the document. */
  imageSources(): string[] {
    const doc = this.wysiwyg?.state.doc ?? parseMarkdown(this.getMarkdown());
    const out = new Set<string>();
    doc.descendants((node) => {
      if (node.type.name === 'image') out.add(node.attrs.src as string);
    });
    return [...out];
  }

  /** Rewrites image sources (old → new), keeping undo history and the cursor. */
  replaceImageSources(map: Map<string, string>): void {
    if (!map.size) return;
    if (this.source) {
      const text = this.source.state.doc.toString();
      const changes: { from: number; to: number; insert: string }[] = [];
      for (const [from, to] of map) {
        for (let index = text.indexOf(from); index >= 0; index = text.indexOf(from, index + from.length))
          changes.push({ from: index, to: index + from.length, insert: to });
      }
      this.source.dispatch({ changes });
      return;
    }
    const view = this.wysiwyg;
    if (!view) return;
    const tr = view.state.tr;
    view.state.doc.descendants((node, pos) => {
      const next = node.type.name === 'image' ? map.get(node.attrs.src as string) : undefined;
      if (next !== undefined) tr.setNodeMarkup(pos, null, { ...node.attrs, src: next });
    });
    tr.setMeta(KEEP_IMAGES_META, true);
    if (tr.docChanged) view.dispatch(tr);
  }

  // ---------- modes ----------

  setMode(mode: EditorMode): void {
    if (mode === this._mode) return;
    const text = this.getMarkdown();
    const doc = this.wysiwyg?.state.doc ?? (text === this.cleanSource ? this.cleanDoc : parseMarkdown(text));
    this.unmount();
    this._mode = mode;
    this.mount(mode, doc, text);
    if (this.findQuery) this.setFind(this.findQuery, false);
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
        saveImage: this.options.saveImage,
        onImagesRemoved: (srcs) => {
          if (!this.destroyed) this.options.onImagesRemoved?.(srcs);
        },
        onUpdate: (_view, docChanged) => {
          if (docChanged) this.options.onChange?.();
          this.scheduleStatus();
        },
      });
      pane.addEventListener('scroll', this.onScroll, { passive: true });
      this.warmLineCache();
    } else if (!sourceModule) {
      // First use of source mode: load CodeMirror, then mount (unless the mode changed meanwhile).
      this.pendingText = text;
      const token = ++this.mountToken;
      void loadSourceEditor().then(() => {
        if (this.destroyed || token !== this.mountToken) return;
        this.pendingText = null;
        this.mount(mode, doc, text);
        if (this.findQuery) this.setFind(this.findQuery, false);
        this.focus();
      });
      return;
    } else {
      const sourcePane = this.pane('mt-source-pane');
      sourcePane.id = 'typora-source';
      this.source = cm().createSourceView(sourcePane, text, {
        prompt: this.options.prompt,
        saveImage: this.options.saveImage,
        onUpdate: (update) => {
          if (update.docChanged) {
            this.options.onChange?.();
            if (this.preview) this.schedulePreview();
          }
          if (update.docChanged || update.selectionSet) this.scheduleStatus();
        },
      });
      this.source.dom.classList.add('CodeMirror', 'cm-s-inner');
      this.source.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
      if (mode === 'split') {
        const previewPane = this.pane('mt-preview-pane');
        this.preview = createWysiwygView(previewPane, doc, {
          style: this.style,
          editable: false,
          resolveUrl: this.options.resolveUrl,
          openLink: this.options.openLink,
        });
        this.previewLines = topLevelLines(text);
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
    this.mountToken++;
    this.pendingText = null;
    clearTimeout(this.previewTimer);
    cancelAnimationFrame(this.scrollFrame);
    this.wysiwyg?.destroy();
    this.source?.destroy();
    this.preview?.destroy();
    this.wysiwyg = this.source = this.preview = null;
    this.dom.replaceChildren();
  }

  /** The scrolling element of the main editing surface. */
  private get scroller(): HTMLElement | null {
    return this.source?.scrollDOM ?? (this.wysiwyg?.dom.parentElement as HTMLElement | null) ?? null;
  }

  private onScroll = (): void => {
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      if (this.preview) this.syncPreview();
      this.emitActiveHeading();
    });
  };

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
      this.syncPreview();
    }, 150);
  }

  /** Scrolls the preview so the block at the top of the source view is at the top of the preview. */
  private syncPreview(): void {
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
  }

  // ---------- outline & navigation ----------

  outline(): OutlineItem[] {
    if (this.source)
      return sourceHeadings(this.source.state.doc.toString()).map(({ level, text }) => ({ level, text }));
    if (!this.wysiwyg) return sourceHeadings(this.getMarkdown()).map(({ level, text }) => ({ level, text }));
    return docHeadings(this.wysiwyg.state.doc).map(({ level, text }) => ({ level, text }));
  }

  private activeHeadingIndex(): number {
    const scroller = this.scroller;
    if (!scroller) return -1;
    const threshold = scroller.getBoundingClientRect().top + 48;
    if (this.source) {
      const top = this.source.lineBlockAtHeight(scroller.scrollTop + 48);
      const topLine = this.source.state.doc.lineAt(top.from).number - 1;
      const headings = sourceHeadings(this.source.state.doc.toString());
      return headings.findLastIndex((h) => h.line <= topLine);
    }
    const view = this.wysiwyg;
    if (!view) return -1;
    const headings = docHeadings(view.state.doc);
    let active = -1;
    for (let i = 0; i < headings.length; i++) {
      const dom = view.nodeDOM(headings[i]!.pos) as HTMLElement | null;
      if (!dom?.getBoundingClientRect) continue;
      if (dom.getBoundingClientRect().top <= threshold) active = i;
      else break;
    }
    return active;
  }

  private emitActiveHeading(force = false): void {
    if (!this.options.onActiveHeading) return;
    const index = this.activeHeadingIndex();
    if (force || index !== this.lastActiveHeading) {
      this.lastActiveHeading = index;
      this.options.onActiveHeading(index);
    }
  }

  /** Scrolls the heading with this outline index to the top and puts the cursor on it. */
  revealHeading(index: number): void {
    if (this.source) {
      const heading = sourceHeadings(this.source.state.doc.toString())[index];
      if (!heading) return;
      const pos = this.source.state.doc.line(heading.line + 1).from;
      this.source.dispatch({
        selection: { anchor: pos },
        effects: cm().EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 }),
      });
    } else {
      const view = this.wysiwyg;
      if (!view) return;
      const heading = docHeadings(view.state.doc)[index];
      if (!heading) return;
      view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(heading.pos + 1))));
      const dom = view.nodeDOM(heading.pos) as HTMLElement | null;
      const scroller = this.scroller;
      if (dom && scroller) {
        const offset = dom.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTo({ top: scroller.scrollTop + offset - 24, behavior: 'smooth' });
      }
    }
    this.focus();
  }

  /** Scrolls to a 1-based line of the markdown source (e.g. a folder search result). */
  revealLine(line: number): void {
    if (this.source) {
      const target = this.source.state.doc.line(Math.min(Math.max(1, line), this.source.state.doc.lines));
      this.source.dispatch({
        selection: { anchor: target.from, head: target.to },
        effects: cm().EditorView.scrollIntoView(target.from, { y: 'center' }),
      });
    } else {
      const view = this.wysiwyg;
      if (!view) return;
      const lines = topLevelLines(this.getMarkdown());
      let index = 0;
      while (index + 1 < lines.length && lines[index + 1]! <= line - 1) index++;
      let pos = 0;
      for (let i = 0; i < index && i < view.state.doc.childCount; i++)
        pos += view.state.doc.child(i).nodeSize;
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.near(view.state.doc.resolve(Math.min(pos + 1, view.state.doc.content.size))),
        ),
      );
      (view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView?.({ block: 'center' });
    }
    this.focus();
  }

  // ---------- find & replace ----------

  /** Sets (or clears, with null) the search. With `jump`, selects the first match after the cursor. */
  setFind(query: FindQuery | null, jump = true): FindResult {
    this.findQuery = query?.text ? query : null;
    if (this.source) return cm().cmSetFind(this.source, query, jump);
    if (!this.wysiwyg) return { count: 0, current: 0, valid: true };
    return pmSetFind(this.wysiwyg, query, jump);
  }

  find(action: FindAction): FindResult {
    if (!this.findQuery) return { count: 0, current: 0, valid: true };
    if (this.source) return cm().cmFind(this.source, action);
    if (!this.wysiwyg) return { count: 0, current: 0, valid: true };
    return pmFind(this.wysiwyg, action);
  }

  // ---------- commands & status ----------

  exec(id: EditorCommandId): boolean {
    if (this.wysiwyg) return runWysiwygCommand(this.wysiwyg, id, this.options);
    if (this.source) return cm().runSourceCommand(this.source, id, this.options);
    return false;
  }

  focus(): void {
    (this.wysiwyg ?? this.source)?.focus();
  }

  private scheduleStatus(delay = STATUS_DELAY): void {
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      this.options.onStatus?.(this.status());
      this.options.onOutline?.(this.outline());
      this.emitActiveHeading(true);
    }, delay);
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
    const doc = this.wysiwyg?.state.doc ?? parseMarkdown(this.getMarkdown());
    const plain = doc.textBetween(0, doc.content.size, '\n', ' ');
    const lines = doc.eq(this.cleanDoc) ? textLines(this.cleanSource) : this.countLines(doc);
    return { ...computeStats(plain, lines), mode: this._mode, cursor: null };
  }

  /**
   * Markdown lines of an edited document without serializing all of it (~200 ms at 10k lines, after
   * every pause in typing): each top-level block is serialized once and its line count cached; blocks
   * are separated by one blank line, as remark writes them.
   */
  /** Fills the line cache of a long document in small idle chunks, so the first edit does not stall. */
  private warmLineCache(): void {
    if (this.cleanSource.length < LONG_DOCUMENT) return;
    clearTimeout(this.warmTimer);
    let index = 0;
    const step = () => {
      // Edits keep the untouched blocks (same nodes), so warming goes on with the current document.
      const doc = this.wysiwyg?.state.doc;
      if (this.destroyed || !doc) return;
      const end = Math.min(doc.childCount, index + WARM_CHUNK);
      for (; index < end; index++) {
        const child = doc.child(index);
        if (!this.blockLines.has(child))
          this.blockLines.set(child, textLines(serializeMarkdown(doc.type.create(null, child), this.style)));
      }
      if (index < doc.childCount) this.warmTimer = setTimeout(step, 16);
    };
    this.warmTimer = setTimeout(step, 1000);
  }

  private countLines(doc: PMNode): number {
    let total = 0;
    doc.forEach((child) => {
      let lines = this.blockLines.get(child);
      if (lines === undefined) {
        lines = textLines(serializeMarkdown(doc.type.create(null, child), this.style));
        this.blockLines.set(child, lines);
      }
      total += lines;
    });
    return total + Math.max(0, doc.childCount - 1);
  }

  destroy(): void {
    this.destroyed = true;
    clearTimeout(this.statusTimer);
    clearTimeout(this.warmTimer);
    this.unmount();
    this.dom.remove();
  }
}
