import type { Translate } from '@marktype/i18n';
import { basename, dirname, isInside, type FolderEntry, type FoldersApi } from '@marktype/platform';
import type { Dialogs } from '../dialogs.svelte.ts';
import { errorMessage } from '../document.svelte.ts';
import type { FileTree } from '../filetree.svelte.ts';
import type { Workspace } from '../workspace.svelte.ts';

const HAS_EXTENSION = /\.[^./\\]+$/;

/** File management from the sidebar: create, rename, move, trash. */
export class FileActions {
  constructor(
    private folders: FoldersApi,
    private tree: FileTree,
    private workspace: Workspace,
    private dialogs: Dialogs,
    private t: Translate,
  ) {}

  private async attempt<T>(action: () => Promise<T>): Promise<T | null> {
    try {
      return await action();
    } catch (error) {
      await this.dialogs.alert(this.t('files.error'), errorMessage(error), this.t('dialog.ok'));
      return null;
    }
  }

  private ask(title: string, value: string): Promise<string | null> {
    return this.dialogs.prompt(
      title,
      this.t('files.name'),
      value,
      this.t('dialog.ok'),
      this.t('dialog.cancel'),
    );
  }

  async newFile(dir: string): Promise<void> {
    const input = await this.ask(this.t('files.newFile.title'), `${this.t('doc.untitled')}.md`);
    if (!input?.trim()) return;
    const name = HAS_EXTENSION.test(input.trim()) ? input.trim() : `${input.trim()}.md`;
    const path = await this.attempt(() => this.folders.createFile(dir, name));
    if (!path) return;
    if (!this.tree.expanded[dir]) await this.tree.toggle(dir);
    else await this.tree.load(dir);
    await this.workspace.openPath(path);
  }

  async newFolder(dir: string): Promise<void> {
    const name = await this.ask(this.t('files.newFolder.title'), '');
    if (!name?.trim()) return;
    const path = await this.attempt(() => this.folders.createFolder(dir, name.trim()));
    if (!path) return;
    if (!this.tree.expanded[dir]) await this.tree.toggle(dir);
    else await this.tree.load(dir);
  }

  async rename(entry: FolderEntry): Promise<void> {
    const name = await this.ask(this.t('files.rename.title'), entry.name);
    if (!name?.trim() || name.trim() === entry.name) return;
    const path = await this.attempt(() => this.folders.rename(entry.path, name.trim()));
    if (!path) return;
    this.tree.forget(entry.path);
    await this.tree.load(dirname(entry.path));
    this.workspace.pathChanged(entry.path, path);
  }

  async move(path: string, targetDir: string): Promise<void> {
    if (dirname(path) === targetDir || isInside(targetDir, path)) return;
    const moved = await this.attempt(() => this.folders.move(path, targetDir));
    if (!moved) return;
    this.tree.forget(path);
    await Promise.all([this.tree.load(dirname(path)), this.tree.load(targetDir)]);
    this.workspace.pathChanged(path, moved);
  }

  async trash(entry: FolderEntry): Promise<void> {
    const choice = await this.dialogs.confirm(
      this.t('files.delete.title'),
      this.t('files.delete.message', { name: basename(entry.path) }),
      [
        { id: 'cancel', label: this.t('dialog.cancel'), cancel: true },
        { id: 'trash', label: this.t('files.delete'), primary: true },
      ],
    );
    if (choice !== 'trash') return;
    const done = await this.attempt(async () => {
      await this.folders.trash(entry.path);
      return true;
    });
    if (!done) return;
    this.tree.forget(entry.path);
    await this.tree.load(dirname(entry.path));
  }

  copyPath(path: string): void {
    void navigator.clipboard?.writeText(path).catch(() => {});
  }
}
