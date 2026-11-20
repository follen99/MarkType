import type { EditorMode } from '@marktype/editor';
import type { Translate } from '@marktype/i18n';
import { isInside, type Draft, type FileRef, type Platform } from '@marktype/platform';
import type { Dialogs } from './dialogs.svelte.ts';
import { DocumentController, errorMessage } from './document.svelte.ts';
import { DEFAULT_IMAGE_SETTINGS, loadImageSettings, type ImageSettings } from './images.ts';
import {
  MAX_RECENT_FOLDERS,
  addRecent,
  pathList,
  removeRecent,
  samePath,
  type Session,
} from './session.ts';

const MAX_RECENT = 20;
const MAX_CLOSED = 20;

/** Open documents (tabs), the opened folder, recent files and folders, the saved session. */
export class Workspace {
  docs = $state<DocumentController[]>([]);
  activeId = $state('');
  folder = $state<string | null>(null);
  autosave = $state(false);
  recentFiles = $state<string[]>([]);
  recentFolders = $state<string[]>([]);
  imageSettings = $state<ImageSettings>(DEFAULT_IMAGE_SETTINGS);

  private main: HTMLElement | null = null;
  private closed: string[] = [];
  private lastMode: EditorMode = 'wysiwyg';
  /** The session is saved only once startup has restored it (or skipped it). */
  private sessionReady = false;

  constructor(
    private platform: Platform,
    private dialogs: Dialogs,
    private t: Translate,
  ) {
    this.autosave = platform.prefs.get('autosave', false);
    this.recentFiles = pathList(platform.prefs.get<unknown>('recentFiles', []), MAX_RECENT);
    this.recentFolders = pathList(platform.prefs.get<unknown>('recentFolders', []), MAX_RECENT_FOLDERS);
    this.lastMode = platform.prefs.get<EditorMode>('mode', 'wysiwyg');
    this.imageSettings = loadImageSettings(platform.prefs);
  }

  get active(): DocumentController | undefined {
    return this.docs.find((d) => d.id === this.activeId);
  }

  attach(main: HTMLElement): void {
    this.main = main;
    for (const doc of this.docs) main.appendChild(doc.container);
    if (!this.docs.length) this.newTab();
  }

  private create(): DocumentController {
    const doc = new DocumentController(
      {
        platform: this.platform,
        dialogs: this.dialogs,
        t: this.t,
        autosave: () => this.autosave,
        openLocal: (path) => void this.openPath(path),
        imageSettings: () => this.imageSettings,
        setImageSettings: (patch) => this.setImageSettings(patch),
      },
      this.lastMode,
    );
    this.main?.appendChild(doc.container);
    this.docs.push(doc);
    return doc;
  }

  newTab(): DocumentController {
    const doc = this.create();
    doc.load('', null, null);
    this.activate(doc);
    return doc;
  }

  activate(doc: DocumentController): void {
    const previous = this.active;
    if (previous && previous !== doc) previous.flushAutosave();
    this.activeId = doc.id;
    for (const d of this.docs) d.container.hidden = d !== doc;
    queueMicrotask(() => doc.focus());
  }

  find(path: string): DocumentController | undefined {
    return this.docs.find((d) => d.file && samePath(d.file.id, path));
  }

  /**
   * Opens a file in a tab (or focuses its tab). Reuses an empty untitled tab. A file that cannot be read
   * leaves no tab behind; a deleted one is also dropped from the recent files.
   */
  async openFile(file: FileRef, remember = true): Promise<DocumentController | null> {
    const existing = this.find(file.id);
    if (existing) {
      this.activate(existing);
      return existing;
    }
    const reuse = this.active?.pristine ? this.active : null;
    const doc = reuse ?? this.create();
    const ok = await doc.openFile(file);
    if (!ok) {
      if (!reuse && this.docs.includes(doc)) this.remove(doc, true);
      if (this.platform.folders && !(await this.platform.folders.exists(file.id))) this.forget([file.id]);
      return null;
    }
    this.activate(doc);
    if (remember) this.remember(file.id);
    return doc;
  }

  async openPath(path: string, remember = true): Promise<DocumentController | null> {
    if (!this.platform.folders) return null;
    return this.openFile(this.platform.folders.fileRef(path), remember);
  }

  async pickAndOpen(): Promise<void> {
    const file = await this.platform.files.pickOpen();
    if (file) await this.openFile(file);
  }

  private remember(path: string): void {
    if (this.platform.kind === 'web') return;
    this.recentFiles = addRecent(this.recentFiles, path, MAX_RECENT);
    this.platform.prefs.set('recentFiles', this.recentFiles);
  }

  /** Drops deleted files and folders from the recent lists and the last folder. */
  forget(paths: string[]): void {
    const { prefs } = this.platform;
    let files = this.recentFiles;
    let folders = this.recentFolders;
    for (const path of paths) {
      files = removeRecent(files, path);
      folders = removeRecent(folders, path);
      const last = prefs.get<string | null>('lastFolder', null);
      if (last && samePath(last, path)) prefs.set('lastFolder', null);
    }
    if (files.length !== this.recentFiles.length) {
      this.recentFiles = files;
      prefs.set('recentFiles', files);
    }
    if (folders.length !== this.recentFolders.length) {
      this.recentFolders = folders;
      prefs.set('recentFolders', folders);
    }
  }

  clearRecentFolders(): void {
    this.recentFolders = [];
    this.platform.prefs.set('recentFolders', null);
  }

  // ---------- session ----------

  /** Starts saving the open tabs (after startup restored them). */
  startSession(): void {
    this.sessionReady = true;
    this.saveSession();
  }

  /** Remembers the tabs that have a file, in order, and the active one (prefs key `session`). */
  saveSession(): void {
    if (!this.sessionReady || this.platform.kind === 'web') return;
    const files = this.docs.flatMap((doc) => (doc.file ? [doc.file.id] : []));
    const session: Session = { files, active: this.active?.file?.id ?? null };
    this.platform.prefs.set('session', files.length ? session : null);
  }

  /** Reopens the files of the last session (already checked to exist), then focuses the active one. */
  async restoreSession(files: string[], active: string | null): Promise<void> {
    for (const path of files) await this.openPath(path, false);
    const doc = active ? this.find(active) : undefined;
    if (doc) this.activate(doc);
  }

  private remove(doc: DocumentController, discard: boolean): void {
    const index = this.docs.indexOf(doc);
    void doc.destroy(discard);
    this.docs.splice(index, 1);
    if (this.activeId === doc.id) {
      const next = this.docs[Math.min(index, this.docs.length - 1)];
      if (next) this.activate(next);
      else this.newTab();
    }
  }

  async closeTab(doc = this.active): Promise<boolean> {
    if (!doc) return false;
    if (doc.dirty) {
      this.activate(doc);
      if (!(await doc.confirmDiscard())) return false;
    }
    if (doc.file) this.closed = [doc.file.id, ...this.closed].slice(0, MAX_CLOSED);
    // Closing the only empty tab does nothing (there is always one tab).
    if (this.docs.length === 1 && doc.pristine) return true;
    this.remove(doc, true);
    return true;
  }

  /** Closes every tab but `keep` (stops if the user cancels on an unsaved one). */
  async closeOthers(keep: DocumentController): Promise<void> {
    for (const doc of this.docs.filter((d) => d !== keep)) {
      if (!(await this.closeTab(doc))) break;
    }
    this.activate(keep);
  }

  async reopenClosed(): Promise<void> {
    const path = this.closed.shift();
    if (path) await this.openPath(path);
  }

  cycle(delta: 1 | -1): void {
    if (this.docs.length < 2) return;
    const index = this.docs.findIndex((d) => d.id === this.activeId);
    this.activate(this.docs[(index + delta + this.docs.length) % this.docs.length]!);
  }

  hasUnsaved(): boolean {
    return this.docs.some((d) => d.dirty);
  }

  /** Asks about every unsaved document; resolves to false if the user cancels. */
  async confirmCloseAll(): Promise<boolean> {
    for (const doc of this.docs.filter((d) => d.dirty)) {
      this.activate(doc);
      if (!(await doc.confirmDiscard())) return false;
    }
    await Promise.all(this.docs.map((doc) => doc.destroy(true)));
    return true;
  }

  // ---------- modes & options ----------

  setMode(mode: EditorMode): void {
    this.lastMode = mode;
    this.platform.prefs.set('mode', mode);
    this.active?.setMode(mode);
  }

  toggleMode(mode: Exclude<EditorMode, 'wysiwyg'>): void {
    const current = this.active?.mode ?? 'wysiwyg';
    this.setMode(current === mode ? 'wysiwyg' : mode);
  }

  cycleMode(): void {
    const order: EditorMode[] = ['wysiwyg', 'source', 'split'];
    const current = this.active?.mode ?? 'wysiwyg';
    this.setMode(order[(order.indexOf(current) + 1) % order.length]!);
  }

  toggleAutosave(): void {
    this.autosave = !this.autosave;
    this.platform.prefs.set('autosave', this.autosave);
    if (this.autosave) for (const doc of this.docs) doc.flushAutosave();
  }

  setImageSettings(patch: Partial<ImageSettings>): void {
    this.imageSettings = { ...this.imageSettings, ...patch };
    this.platform.prefs.set('images', $state.snapshot(this.imageSettings));
  }

  flushAutosave(): void {
    for (const doc of this.docs) doc.flushAutosave();
  }

  // ---------- folder ----------

  async openFolder(path: string): Promise<void> {
    this.folder = path;
    this.platform.prefs.set('lastFolder', path);
    this.recentFolders = addRecent(this.recentFolders, path, MAX_RECENT_FOLDERS);
    this.platform.prefs.set('recentFolders', this.recentFolders);
  }

  closeFolder(): void {
    this.folder = null;
    this.platform.prefs.set('lastFolder', null);
  }

  /** Keeps tabs pointing at the right files after a rename or move in the sidebar. */
  pathChanged(oldPath: string, newPath: string): void {
    const folders = this.platform.folders;
    if (!folders) return;
    for (const doc of this.docs) {
      if (!doc.file || !isInside(doc.file.id, oldPath)) continue;
      const rest = doc.file.id.slice(oldPath.length);
      doc.setFile(folders.fileRef(newPath + rest));
    }
    const moved = (p: string) => (isInside(p, oldPath) ? newPath + p.slice(oldPath.length) : p);
    this.recentFiles = this.recentFiles.map(moved);
    this.platform.prefs.set('recentFiles', this.recentFiles);
    this.recentFolders = this.recentFolders.map(moved);
    this.platform.prefs.set('recentFolders', this.recentFolders);
  }

  // ---------- crash recovery ----------

  /** Offers to restore unsaved changes left by a crash. */
  async recoverDrafts(): Promise<void> {
    let drafts: Draft[];
    try {
      drafts = await this.platform.drafts.list();
    } catch {
      return;
    }
    if (!drafts.length) return;
    const { t } = this;
    const choice = await this.dialogs.confirm(
      t('recovery.title'),
      t('recovery.message', { count: drafts.length, names: drafts.map((d) => d.name).join(', ') }),
      [
        { id: 'discard', label: t('recovery.discard'), danger: true },
        { id: 'recover', label: t('recovery.recover'), primary: true, cancel: true },
      ],
    );
    for (const draft of drafts) {
      if (choice === 'recover') await this.restore(draft);
      await this.platform.drafts.remove(draft.id).catch(() => {});
    }
  }

  private async restore(draft: Draft): Promise<void> {
    const reuse = this.active?.pristine ? this.active : null;
    const doc = reuse ?? this.create();
    let saved = '';
    let file: FileRef | null = null;
    let stamp = null;
    if (draft.path && this.platform.folders) {
      file = this.platform.folders.fileRef(draft.path);
      try {
        ({ text: saved, stamp } = await this.platform.files.read(file));
      } catch (error) {
        // The file is gone: restore the text as a new document.
        console.warn('recovery: cannot read', draft.path, errorMessage(error));
        file = null;
      }
    }
    doc.load(saved, file, stamp, draft.text);
    this.activate(doc);
  }
}
