import { dirname, isInside, type FolderEntry, type FoldersApi } from '@marktype/platform';

/** Lazily loaded folder tree: a directory is listed the first time it is expanded. */
export class FileTree {
  root = $state<string | null>(null);
  children = $state<Record<string, FolderEntry[]>>({});
  expanded = $state<Record<string, boolean>>({});
  error = $state<string | null>(null);

  constructor(private folders: FoldersApi) {}

  async open(root: string): Promise<void> {
    this.root = root;
    this.children = {};
    this.expanded = { [root]: true };
    this.error = null;
    try {
      this.children[root] = await this.folders.open(root);
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  close(): void {
    this.root = null;
    this.children = {};
    this.expanded = {};
  }

  async load(dir: string): Promise<void> {
    try {
      this.children[dir] = await this.folders.list(dir);
    } catch {
      delete this.children[dir];
      delete this.expanded[dir];
    }
  }

  async toggle(dir: string): Promise<void> {
    if (this.expanded[dir]) {
      delete this.expanded[dir];
      return;
    }
    this.expanded[dir] = true;
    if (!this.children[dir]) await this.load(dir);
  }

  /** Re-lists every loaded folder (after file operations or when the window regains focus). */
  async refresh(): Promise<void> {
    await Promise.all(Object.keys(this.children).map((dir) => this.load(dir)));
  }

  /** Expands the folders leading to `path` so it is visible. */
  async reveal(path: string): Promise<void> {
    if (!this.root || !isInside(path, this.root)) return;
    const chain: string[] = [];
    for (let dir = dirname(path); isInside(dir, this.root) && dir !== this.root; dir = dirname(dir)) {
      chain.unshift(dir);
      if (dirname(dir) === dir) break;
    }
    for (const dir of chain) {
      this.expanded[dir] = true;
      if (!this.children[dir]) await this.load(dir);
    }
  }

  /** After a rename/move: drop cached listings under the old path. */
  forget(path: string): void {
    for (const key of Object.keys(this.children)) if (isInside(key, path)) delete this.children[key];
    for (const key of Object.keys(this.expanded)) if (isInside(key, path)) delete this.expanded[key];
  }
}
