/**
 * The only boundary between the shared UI and the host system.
 * `apps/desktop` implements it on top of Tauri; `apps/web` on top of browser APIs.
 * The interface grows milestone by milestone (see docs/ARCHITECTURE.md for the full target shape).
 */

export type PlatformKind = 'desktop' | 'web' | 'mobile';
export type OsName = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

export interface PlatformCapabilities {
  /** The UI draws its own minimize / maximize / close buttons. */
  windowControls: boolean;
  /** Folders can be opened (file tree, search in folder). */
  folders: boolean;
  /** Files are saved in place; otherwise "save" downloads a copy. */
  saveInPlace: boolean;
}

export type Unsubscribe = () => void;

/** A document location. On desktop `id` is the absolute path; on the web an opaque handle id. */
export interface FileRef {
  id: string;
  name: string;
}

/** Version of a file on disk, used to detect changes made by other programs. */
export interface FileStamp {
  modifiedMs: number;
  size: number;
}

export interface ReadFileResult {
  text: string;
  stamp: FileStamp | null;
}

export type WriteFileResult = { status: 'ok'; stamp: FileStamp | null } | { status: 'conflict' };

export interface FilesApi {
  pickOpen(): Promise<FileRef | null>;
  pickSave(suggestedName: string): Promise<FileRef | null>;
  read(file: FileRef): Promise<ReadFileResult>;
  /** Writes `text`. With `expected`, refuses (status `conflict`) if the file changed since then. */
  write(file: FileRef, text: string, expected: FileStamp | null): Promise<WriteFileResult>;
}

export interface WindowApi {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  /** 1 = 100%. */
  setZoom(factor: number): Promise<void>;
  /** Called whenever the window is resized (maximized state may have changed). */
  onResized(cb: () => void): Promise<Unsubscribe>;
  onCloseRequested(guard: CloseGuard): Promise<Unsubscribe>;
}

export interface CloseGuard {
  hasUnsavedChanges(): boolean;
  /** Asks the user what to do with unsaved changes; resolves to false to keep the window open. */
  confirmClose(): Promise<boolean>;
}

export interface FolderEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FolderSearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FolderSearchResults {
  files: {
    path: string;
    /** `ranges` are [start, end) indices in `text`. */
    matches: { line: number; text: string; ranges: [number, number][] }[];
  }[];
  total: number;
  truncated: boolean;
}

/** Folder access (desktop only). Paths are absolute. */
export interface FoldersApi {
  pick(): Promise<string | null>;
  /** Grants access to the folder tree and lists its first level. */
  open(path: string): Promise<FolderEntry[]>;
  list(path: string): Promise<FolderEntry[]>;
  markdownFiles(root: string): Promise<string[]>;
  search(root: string, options: FolderSearchOptions): Promise<FolderSearchResults>;
  createFile(dir: string, name: string): Promise<string>;
  createFolder(dir: string, name: string): Promise<string>;
  rename(path: string, newName: string): Promise<string>;
  move(path: string, targetDir: string): Promise<string>;
  /** Moves to the OS trash / recycle bin. */
  trash(path: string): Promise<void>;
  fileRef(path: string): FileRef;
}

/** A copy of unsaved changes, kept to recover them after a crash. */
export interface Draft {
  id: string;
  path: string | null;
  name: string;
  text: string;
  savedAt: number;
}

export interface DraftsApi {
  save(draft: Draft): Promise<void>;
  remove(id: string): Promise<void>;
  list(): Promise<Draft[]>;
}

/** Small persistent key/value store for UI state (until settings.json lands in M6). */
export interface PrefsApi {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly os: OsName;
  readonly appVersion: string;
  readonly capabilities: PlatformCapabilities;
  readonly window: WindowApi;
  readonly files: FilesApi;
  /** null where folders cannot be opened (web). */
  readonly folders: FoldersApi | null;
  readonly drafts: DraftsApi;
  readonly prefs: PrefsApi;
  /** URL the webview can load for an image `src` written in the document `doc`. */
  resolveAssetUrl(doc: FileRef | null, src: string): string;
  /** Local path a relative link in `doc` points to, or null (web, or not a local link). */
  resolveLocalLink(doc: FileRef | null, href: string): string | null;
  openExternal(url: string): Promise<void>;
}

/** localStorage-backed prefs; every access is guarded (private mode, blocked storage). */
export function localPrefs(prefix: string): PrefsApi {
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        // storage unavailable: preferences are just not remembered
      }
    },
  };
}

export * from './paths.ts';

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for `https:`, `data:`, `mailto:`… but not for Windows drive paths like `C:\`. */
export function hasUrlScheme(src: string): boolean {
  return URL_SCHEME.test(src) && !/^[a-z]:[\\/]/i.test(src);
}
