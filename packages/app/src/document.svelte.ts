import { EditorHost, type EditorCommandId, type EditorMode, type EditorStatus } from '@marktype/editor';
import type { Translate } from '@marktype/i18n';
import { hasUrlScheme, type FileRef, type FileStamp, type Platform } from '@marktype/platform';
import type { Dialogs } from './dialogs.svelte.ts';

type LineEnding = '\n' | '\r\n';

interface Decoded {
  text: string;
  bom: boolean;
  eol: LineEnding;
}

/** Editors work with `\n`; the original BOM and line endings are restored on save. */
export function decodeText(raw: string): Decoded {
  const bom = raw.startsWith('﻿');
  const body = bom ? raw.slice(1) : raw;
  const eol: LineEnding = body.includes('\r\n') ? '\r\n' : '\n';
  return { text: body.replace(/\r\n?/g, '\n'), bom, eol };
}

export function encodeText(text: string, bom: boolean, eol: LineEnding): string {
  return (bom ? '﻿' : '') + (eol === '\r\n' ? text.replace(/\n/g, '\r\n') : text);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The open document: file identity, editor, dirty state and the open/save workflows. */
export class DocumentController {
  file = $state<FileRef | null>(null);
  dirty = $state(false);
  mode = $state<EditorMode>('wysiwyg');
  status = $state<EditorStatus | null>(null);

  private host: EditorHost | null = null;
  private container: HTMLElement | null = null;
  private stamp: FileStamp | null = null;
  private bom = false;
  private eol: LineEnding = '\n';

  constructor(
    private platform: Platform,
    private dialogs: Dialogs,
    private t: Translate,
  ) {}

  get name(): string {
    return this.file?.name ?? this.t('doc.untitled');
  }

  attach(container: HTMLElement): void {
    this.container = container;
    this.load('', null, null);
  }

  detach(): void {
    this.host?.destroy();
    this.host = null;
    this.container = null;
  }

  private load(raw: string, file: FileRef | null, stamp: FileStamp | null): void {
    if (!this.container) return;
    const decoded = decodeText(raw);
    this.host?.destroy();
    this.file = file;
    this.stamp = stamp;
    this.bom = decoded.bom;
    this.eol = decoded.eol;
    this.dirty = false;
    this.host = new EditorHost(this.container, {
      markdown: decoded.text,
      mode: this.mode,
      resolveUrl: (src) => this.platform.resolveAssetUrl(this.file, src),
      openLink: (href) => {
        if (hasUrlScheme(href)) void this.platform.openExternal(href);
      },
      prompt: (kind, initial) =>
        this.dialogs.prompt(
          this.t(kind === 'link' ? 'prompt.link.title' : 'prompt.image.title'),
          this.t(kind === 'link' ? 'prompt.link.label' : 'prompt.image.label'),
          initial,
          this.t('dialog.ok'),
          this.t('dialog.cancel'),
        ),
      onChange: () => {
        this.dirty = this.host?.isDirty() ?? false;
      },
      onStatus: (status) => {
        this.status = status;
      },
    });
    this.host.focus();
  }

  // ---------- workflows ----------

  /** Resolves to true when it is fine to replace or close the current document. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.host?.isDirty()) return true;
    const choice = await this.dialogs.confirm(
      this.t('doc.saveChanges.title'),
      this.t('doc.saveChanges.message', { name: this.name }),
      [
        { id: 'discard', label: this.t('doc.saveChanges.discard'), danger: true },
        { id: 'cancel', label: this.t('dialog.cancel'), cancel: true },
        { id: 'save', label: this.t('doc.saveChanges.save'), primary: true },
      ],
    );
    if (choice === 'save') return this.save();
    return choice === 'discard';
  }

  async newDocument(): Promise<void> {
    if (await this.confirmDiscard()) this.load('', null, null);
  }

  async open(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const file = await this.platform.files.pickOpen();
    if (file) await this.openFile(file);
  }

  async openFile(file: FileRef): Promise<boolean> {
    try {
      const { text, stamp } = await this.platform.files.read(file);
      this.load(text, file, stamp);
      return true;
    } catch (error) {
      await this.dialogs.alert(this.t('doc.error.open'), errorMessage(error), this.t('dialog.ok'));
      return false;
    }
  }

  async save(): Promise<boolean> {
    if (!this.file || !this.platform.capabilities.saveInPlace) return this.saveAs();
    return this.write(this.file, this.stamp);
  }

  async saveAs(): Promise<boolean> {
    const suggested = this.file?.name ?? `${this.t('doc.untitled')}.md`;
    const file = await this.platform.files.pickSave(suggested);
    return file ? this.write(file, null) : false;
  }

  private async write(file: FileRef, expected: FileStamp | null): Promise<boolean> {
    if (!this.host) return false;
    const markdown = this.host.getMarkdown();
    try {
      const result = await this.platform.files.write(
        file,
        encodeText(markdown, this.bom, this.eol),
        expected,
      );
      if (result.status === 'conflict') return this.resolveConflict(file);
      this.file = file;
      this.stamp = result.stamp;
      this.host.markClean(markdown);
      this.dirty = this.host.isDirty();
      return true;
    } catch (error) {
      await this.dialogs.alert(this.t('doc.error.save'), errorMessage(error), this.t('dialog.ok'));
      return false;
    }
  }

  private async resolveConflict(file: FileRef): Promise<boolean> {
    const choice = await this.dialogs.confirm(
      this.t('doc.conflict.title'),
      this.t('doc.conflict.message', { name: file.name }),
      [
        { id: 'reload', label: this.t('doc.conflict.reload'), danger: true },
        { id: 'cancel', label: this.t('dialog.cancel'), cancel: true },
        { id: 'overwrite', label: this.t('doc.conflict.overwrite'), primary: true },
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

  toggleMode(mode: Exclude<EditorMode, 'wysiwyg'>): void {
    const next = this.mode === mode ? 'wysiwyg' : mode;
    this.mode = next;
    this.host?.setMode(next);
  }

  focus(): void {
    this.host?.focus();
  }
}
