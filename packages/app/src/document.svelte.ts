import {
  EditorHost,
  type EditorCommandId,
  type EditorMode,
  type EditorStatus,
  type FindAction,
  type FindQuery,
  type FindResult,
  type ImageRef,
  type OutlineItem,
} from '@marktype/editor';
import type { Translate } from '@marktype/i18n';
import {
  basename,
  decodePathComponent,
  hasUrlScheme,
  isAbsolutePath,
  isInside,
  resolvePath,
  type FileRef,
  type FileStamp,
  type Platform,
} from '@marktype/platform';
import {
  expandNamePattern,
  frontMatterCopyTo,
  imageExtension,
  imageFolder,
  imageMarkdownSrc,
  sanitizeFileName,
  shortHash,
  stem,
  type ImageInput,
  type ImageSettings,
} from './images.ts';
import type { Dialogs } from './dialogs.svelte.ts';

type LineEnding = '\n' | '\r\n';

interface Decoded {
  text: string;
  bom: boolean;
  eol: LineEnding;
}

const BOM = '﻿';

/** Editors work with `\n`; the original BOM and line endings are restored on save. */
export function decodeText(raw: string): Decoded {
  const bom = raw.startsWith(BOM);
  const body = bom ? raw.slice(1) : raw;
  const eol: LineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  return { text: body.replace(/\r\n?/g, '\n'), bom, eol };
}

export function encodeText(text: string, bom: boolean, eol: LineEnding): string {
  return (bom ? BOM : '') + (eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const AUTOSAVE_DELAY = 1500;
const DRAFT_DELAY = 2000;
let nextId = 1;

function newDraftId(): string {
  return `${Date.now().toString(36)}-${(nextId++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface DocumentEnv {
  platform: Platform;
  dialogs: Dialogs;
  t: Translate;
  autosave(): boolean;
  /** Ctrl+click on a link to a local markdown file. */
  openLocal(path: string): void;
  imageSettings(): ImageSettings;
}

/** One open document (a tab): file identity, editor, dirty state and save workflows. */
export class DocumentController {
  readonly id = newDraftId();
  readonly container: HTMLElement;
  file = $state<FileRef | null>(null);
  dirty = $state(false);
  mode = $state<EditorMode>('wysiwyg');
  status = $state<EditorStatus | null>(null);
  outline = $state<OutlineItem[]>([]);
  activeHeading = $state(-1);

  private host: EditorHost | null = null;
  private stamp: FileStamp | null = null;
  private bom = false;
  private eol: LineEnding = '\n';
  private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<boolean> | null = null;

  constructor(
    private env: DocumentEnv,
    mode: EditorMode,
  ) {
    this.mode = mode;
    this.container = document.createElement('div');
    this.container.className = 'mt-doc';
  }

  get name(): string {
    return this.file?.name ?? this.env.t('doc.untitled');
  }

  /** An untitled, untouched, empty document: replaced when the user opens a file. */
  get pristine(): boolean {
    return !this.file && !this.dirty && (this.host?.isEmpty() ?? true);
  }

  /**
   * Loads content. `draft` is unsaved text recovered after a crash: it is shown, while `raw` stays the
   * saved reference.
   */
  load(raw: string, file: FileRef | null, stamp: FileStamp | null, draft?: string): void {
    const decoded = decodeText(raw);
    this.host?.destroy();
    this.file = file;
    this.stamp = stamp;
    this.bom = decoded.bom;
    this.eol = decoded.eol;
    const { platform, dialogs, t } = this.env;
    this.host = new EditorHost(this.container, {
      markdown: draft ?? decoded.text,
      savedMarkdown: decoded.text,
      mode: this.mode,
      resolveUrl: (src) => platform.resolveAssetUrl(this.file, src),
      openLink: (href) => {
        if (hasUrlScheme(href)) return void platform.openExternal(href);
        const local = platform.resolveLocalLink(this.file, href);
        if (local) this.env.openLocal(local);
      },
      prompt: (kind, initial) =>
        dialogs.prompt(
          t(kind === 'link' ? 'prompt.link.title' : 'prompt.image.title'),
          t(kind === 'link' ? 'prompt.link.label' : 'prompt.image.label'),
          initial,
          t('dialog.ok'),
          t('dialog.cancel'),
        ),
      saveImage: (file) =>
        this.storeImage({
          name: file.name,
          type: file.type,
          path: null,
          read: async () => new Uint8Array(await file.arrayBuffer()),
        }),
      onChange: () => this.onChange(),
      onStatus: (status) => (this.status = status),
      onOutline: (outline) => (this.outline = outline),
      onActiveHeading: (index) => (this.activeHeading = index),
    });
    this.dirty = this.host.isDirty();
    if (this.dirty) this.scheduleDraft();
  }

  async openFile(file: FileRef): Promise<boolean> {
    try {
      const { text, stamp } = await this.env.platform.files.read(file);
      this.load(text, file, stamp);
      return true;
    } catch (error) {
      const { dialogs, t } = this.env;
      await dialogs.alert(t('doc.error.open'), errorMessage(error), t('dialog.ok'));
      return false;
    }
  }

  /** The file was renamed or moved by the user from the sidebar. */
  setFile(file: FileRef): void {
    this.file = file;
    this.stamp = null;
  }

  // ---------- changes, autosave, drafts ----------

  private onChange(): void {
    this.dirty = this.host?.isDirty() ?? false;
    if (!this.dirty) {
      clearTimeout(this.draftTimer);
      void this.env.platform.drafts.remove(this.id).catch(() => {});
      return;
    }
    this.scheduleDraft();
    if (this.env.autosave() && this.file && this.env.platform.capabilities.saveInPlace) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = setTimeout(() => void this.save(), AUTOSAVE_DELAY);
    }
  }

  private scheduleDraft(): void {
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      if (!this.host || !this.dirty) return;
      void this.env.platform.drafts
        .save({
          id: this.id,
          path: this.file?.id ?? null,
          name: this.name,
          text: this.host.getMarkdown(),
          savedAt: Date.now(),
        })
        .catch(() => {});
    }, DRAFT_DELAY);
  }

  /** Saves now if autosave applies (tab switch, window blur). */
  flushAutosave(): void {
    if (this.dirty && this.file && this.env.autosave() && this.env.platform.capabilities.saveInPlace) {
      clearTimeout(this.autosaveTimer);
      void this.save();
    }
  }

  // ---------- images ----------

  /**
   * Copies an image next to the document (docs/SPEC.md §10) and returns how to reference it. Unsaved
   * documents keep their images in a pending folder until the first save. Resolves to null if the user
   * cancels or the copy fails (after telling them).
   */
  async storeImage(input: ImageInput): Promise<ImageRef | null> {
    const { platform, dialogs, t } = this.env;
    const images = platform.images;
    const original = stem(input.name) || 'image';
    try {
      if (!images) {
        // Web: the image lives in memory for this session.
        const blob = new Blob([(await input.read()) as Uint8Array<ArrayBuffer>], { type: input.type });
        return { src: URL.createObjectURL(blob), alt: original };
      }
      const settings = this.env.imageSettings();
      const doc = this.file;
      let dir: string | null;
      if (doc) {
        dir = imageFolder(doc.id, settings, frontMatterCopyTo(this.host?.getMarkdown() ?? ''));
        if (dir === null && input.path) return { src: imageMarkdownSrc(doc.id, input.path), alt: original };
        // "No copy" cannot keep a pasted image anywhere else: it goes to ./assets.
        dir ??= imageFolder(doc.id, { ...settings, destination: 'assets' }, null)!;
      } else {
        dir = resolvePath(await images.pendingRoot(), this.id);
      }
      const bytes = await input.read();
      const hash = settings.pattern.includes('${hash}') ? await shortHash(bytes) : '';
      let name = expandNamePattern(settings.pattern, {
        filename: stem(doc?.name ?? t('doc.untitled')),
        original,
        date: new Date(),
        hash,
      });
      if (settings.askName) {
        const answer = await dialogs.prompt(
          t('image.name.title'),
          t('image.name.label'),
          name,
          t('dialog.ok'),
          t('dialog.cancel'),
        );
        if (answer === null) return null;
        name = answer.trim() || name;
      }
      const path = await images.save(
        dir,
        `${sanitizeFileName(name)}.${imageExtension(input.name, input.type)}`,
        bytes,
      );
      return { src: imageMarkdownSrc(doc?.id ?? null, path), alt: stem(path) };
    } catch (error) {
      await dialogs.alert(t('image.error.save'), errorMessage(error), t('dialog.ok'));
      return null;
    }
  }

  /** Stores images (file drop, insert from file) and inserts them at `point` or at the cursor. */
  async insertImages(inputs: ImageInput[], point?: { x: number; y: number }): Promise<void> {
    const refs: ImageRef[] = [];
    for (const input of inputs) {
      const ref = await this.storeImage(input);
      if (ref) refs.push(ref);
    }
    this.host?.insertImages(refs, point);
  }

  /**
   * Before writing to `file`: moves images still in the pending folder (pasted while the document was
   * untitled) to their destination and rewrites their paths. An image that cannot be moved keeps its
   * pending path, so nothing is lost.
   */
  private async relocatePendingImages(file: FileRef): Promise<void> {
    const images = this.env.platform.images;
    if (!images || !this.host) return;
    const sources = this.host.imageSources();
    if (!sources.length) return;
    const root = await images.pendingRoot();
    const settings = this.env.imageSettings();
    const map = new Map<string, string>();
    for (const src of sources) {
      if (hasUrlScheme(src)) continue;
      const path = decodePathComponent(src);
      if (!isAbsolutePath(path) || !isInside(path, root)) continue;
      const dir =
        imageFolder(file.id, settings, frontMatterCopyTo(this.host.getMarkdown())) ??
        imageFolder(file.id, { ...settings, destination: 'assets' }, null)!;
      try {
        map.set(src, imageMarkdownSrc(file.id, await images.move(path, dir)));
      } catch (error) {
        console.error('Cannot move pending image', basename(path), error);
      }
    }
    this.host.replaceImageSources(map);
  }

  // ---------- save ----------

  /** Asks to save unsaved changes. Resolves to true when the document may be closed or replaced. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.host?.isDirty()) return true;
    const { dialogs, t } = this.env;
    const choice = await dialogs.confirm(
      t('doc.saveChanges.title'),
      t('doc.saveChanges.message', { name: this.name }),
      [
        { id: 'discard', label: t('doc.saveChanges.discard'), danger: true },
        { id: 'cancel', label: t('dialog.cancel'), cancel: true },
        { id: 'save', label: t('doc.saveChanges.save'), primary: true },
      ],
    );
    if (choice === 'save') return this.save();
    return choice === 'discard';
  }

  save(): Promise<boolean> {
    // Serialize saves (autosave + Ctrl+S at the same time).
    const run = async () => {
      if (!this.file || !this.env.platform.capabilities.saveInPlace) return this.saveAs();
      return this.write(this.file, this.stamp);
    };
    this.saving = (this.saving ?? Promise.resolve(true)).then(run, run).finally(() => (this.saving = null));
    return this.saving;
  }

  async saveAs(): Promise<boolean> {
    const suggested = this.file?.name ?? `${this.env.t('doc.untitled')}.md`;
    const file = await this.env.platform.files.pickSave(suggested);
    return file ? this.write(file, null) : false;
  }

  private async write(file: FileRef, expected: FileStamp | null): Promise<boolean> {
    if (!this.host) return false;
    clearTimeout(this.autosaveTimer);
    await this.relocatePendingImages(file).catch((error: unknown) => console.error(error));
    if (!this.host) return false;
    const markdown = this.host.getMarkdown();
    const { platform, dialogs, t } = this.env;
    try {
      const result = await platform.files.write(file, encodeText(markdown, this.bom, this.eol), expected);
      if (result.status === 'conflict') return this.resolveConflict(file);
      this.file = file;
      this.stamp = result.stamp;
      this.host.markClean(markdown);
      this.dirty = this.host.isDirty();
      clearTimeout(this.draftTimer);
      void platform.drafts.remove(this.id).catch(() => {});
      return true;
    } catch (error) {
      await dialogs.alert(t('doc.error.save'), errorMessage(error), t('dialog.ok'));
      return false;
    }
  }

  private async resolveConflict(file: FileRef): Promise<boolean> {
    const { dialogs, t } = this.env;
    const choice = await dialogs.confirm(
      t('doc.conflict.title'),
      t('doc.conflict.message', { name: file.name }),
      [
        { id: 'reload', label: t('doc.conflict.reload'), danger: true },
        { id: 'cancel', label: t('dialog.cancel'), cancel: true },
        { id: 'overwrite', label: t('doc.conflict.overwrite'), primary: true },
      ],
    );
    if (choice === 'overwrite') return this.write(file, null);
    if (choice === 'reload') await this.openFile(file);
    return false;
  }

  // ---------- editing ----------

  exec(id: EditorCommandId): void {
    this.host?.exec(id);
  }

  setMode(mode: EditorMode): void {
    this.mode = mode;
    this.host?.setMode(mode);
  }

  revealHeading(index: number): void {
    this.host?.revealHeading(index);
  }

  revealLine(line: number): void {
    this.host?.revealLine(line);
  }

  setFind(query: FindQuery | null, jump = true): FindResult | null {
    return this.host?.setFind(query, jump) ?? null;
  }

  find(action: FindAction): FindResult | null {
    return this.host?.find(action) ?? null;
  }

  focus(): void {
    this.host?.focus();
  }

  /** The current text (what Save would write). */
  markdown(): string {
    return this.host?.getMarkdown() ?? '';
  }

  /**
   * Closes the editor. With `discard`, also forgets the crash-recovery copy; the returned promise
   * settles once it is gone (await it before the window closes).
   */
  destroy(discard: boolean): Promise<void> {
    clearTimeout(this.autosaveTimer);
    clearTimeout(this.draftTimer);
    this.host?.destroy();
    this.host = null;
    this.container.remove();
    if (!discard) return Promise.resolve();
    const { drafts, images } = this.env.platform;
    return Promise.all([
      drafts.remove(this.id).catch(() => {}),
      images?.discardPending(this.id).catch(() => {}),
    ]).then(() => {});
  }
}
