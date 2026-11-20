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
  /**
   * Files dropped from the OS file manager, where the platform reports them with their paths (desktop).
   * Elsewhere drops arrive as ordinary DOM drag events and this never fires.
   */
  onFileDrop(cb: (drop: FileDrop) => void): Promise<Unsubscribe>;
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
  /** What is at `path`: a file, a folder, or nothing (also on any error). */
  exists(path: string): Promise<'file' | 'dir' | null>;
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

/** A Typora-compatible theme installed by the user. URLs are loadable as `<link href>`. */
export interface UserTheme {
  /** File stem, unique among user themes. */
  id: string;
  name: string;
  url: string;
  dark: boolean;
  /** `<id>.user.css`, applied on top of this theme only. */
  userCssUrl: string | null;
}

export interface UserThemeList {
  themes: UserTheme[];
  /** `base.user.css`, applied on top of every theme. */
  baseUserCssUrl: string | null;
}

/** The user themes folder (desktop only). */
export interface ThemesApi {
  list(): Promise<UserThemeList>;
  /** Called (possibly several times in a row) when files in the themes folder change. */
  onChange(cb: () => void): Promise<Unsubscribe>;
  openFolder(): Promise<void>;
}

/**
 * Image files next to documents (desktop only). Paths are absolute; the app decides folder and name
 * (docs/SPEC.md §10), the platform only writes and never replaces an existing file.
 */
export interface ImagesApi {
  /**
   * Writes `bytes` into `dir` (created if missing) as `name`, or `name-1.png`, `name-2.png`… when that
   * name is taken. Resolves to the path written.
   */
  save(dir: string, name: string, bytes: Uint8Array): Promise<string>;
  /** Moves the image at `path` into `dir` under a free name; resolves to the new path. */
  move(path: string, dir: string): Promise<string>;
  read(path: string): Promise<Uint8Array>;
  /** Asks the user for image files to insert. */
  pick(): Promise<string[]>;
  /** Folder holding the images of documents not saved yet (one subfolder per document id). */
  pendingRoot(): Promise<string>;
  /** Deletes the pending images of a document closed without saving. */
  discardPending(docId: string): Promise<void>;
}

/** Files dropped on the window from the file manager; `x`/`y` in CSS pixels of the page. */
export interface FileDrop {
  paths: string[];
  x: number;
  y: number;
}

/**
 * Persistent key/value settings. Desktop: `settings.json` in the user config folder (docs/SPEC.md §16);
 * web: localStorage. Reads are synchronous (loaded at startup); setting `null` removes the key.
 */
export interface PrefsApi {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
}

/** The hand-editable configuration files (desktop only). */
export interface ConfigApi {
  /** Full path of `settings.json`, for display. */
  readonly settingsPath: string;
  /** Set when `settings.json` is not valid JSON: the app runs with defaults and never overwrites it. */
  readonly settingsError: string | null;
  /** Shortcut overrides from `keybindings.json` (`{}` if missing); rejects with a message if invalid. */
  keybindings(): Promise<Record<string, unknown>>;
  /** Opens the file in the system editor, creating it if needed. */
  openFile(name: 'settings' | 'keybindings'): Promise<void>;
}

/** A file or folder the OS asks the app to open. */
export interface LaunchPath {
  path: string;
  isDir: boolean;
}

/** Command line, double click on a file, "Open with", second launch (desktop only). */
export interface LaunchApi {
  /** Paths the app was started with. Subscribe with `onOpen` first, then call this once. */
  initial(): Promise<LaunchPath[]>;
  /** Paths sent while the app runs (another launch hands them to this window). */
  onOpen(cb: (paths: LaunchPath[]) => void): Promise<Unsubscribe>;
}

export interface ExportFilter {
  name: string;
  extensions: string[];
}

export type PandocFormat = 'docx' | 'odt' | 'rtf' | 'epub' | 'latex';

export interface PandocJob {
  /** Program to run; empty = `pandoc` from PATH. */
  pandoc: string;
  markdown: string;
  format: PandocFormat;
  output: string;
  /** Folder relative image paths are resolved from (the document's). */
  resourceDir: string | null;
}

/** Thrown by `PandocApi.run` when Pandoc is not installed (or not at the configured path). */
export const PANDOC_NOT_FOUND = 'pandoc-not-found';

export interface PandocApi {
  /** `pandoc 3.6.2`, or null when it cannot be run. */
  version(pandocPath: string): Promise<string | null>;
  run(job: PandocJob): Promise<void>;
}

export interface ExportApi {
  /** Asks where to export; resolves to the target (a path on desktop, a file name on the web) or null. */
  pickTarget(suggestedName: string, filter: ExportFilter): Promise<string | null>;
  writeText(target: string, text: string): Promise<void>;
  /** Opens an exported file with its default program; null where that is not possible (web). */
  open: ((path: string) => Promise<void>) | null;
  /** null where external programs cannot run (web). */
  pandoc: PandocApi | null;
}

/**
 * Prefs kept in memory and persisted by `persist`, which receives only the changed keys (`null` = removed),
 * batched for `delay` ms. Used for `settings.json` on desktop.
 */
export function memoryPrefs(
  initial: Record<string, unknown>,
  persist: ((patch: Record<string, unknown>) => Promise<void>) | null,
  delay = 150,
): PrefsApi & { flush(): Promise<void> } {
  const values = new Map(Object.entries(initial));
  // JSON, not structuredClone: values may be Svelte state proxies, and they end up in a JSON file anyway.
  const jsonCopy = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;
  let patch: Record<string, unknown> = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    const pending = patch;
    patch = {};
    if (persist && Object.keys(pending).length) {
      try {
        await persist(pending);
      } catch (error) {
        console.warn('Settings not saved:', error);
      }
    }
  };
  return {
    get<T>(key: string, fallback: T): T {
      return values.has(key) ? (jsonCopy(values.get(key)) as T) : fallback;
    },
    set(key, value) {
      // A copy: callers may keep mutating the object they passed.
      const copy = value === undefined || value === null ? null : jsonCopy(value);
      if (copy === null) values.delete(key);
      else values.set(key, copy);
      patch[key] = copy;
      if (!persist) return;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
  };
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
  /** null where there is no themes folder (web): only the built-in themes are offered. */
  readonly themes: ThemesApi | null;
  /** null where images cannot be written next to the document (web: pasted images stay in memory). */
  readonly images: ImagesApi | null;
  readonly prefs: PrefsApi;
  /** null where there are no configuration files (web). */
  readonly config: ConfigApi | null;
  /** null where the OS cannot hand files to the app (web). */
  readonly launch: LaunchApi | null;
  readonly export: ExportApi;
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
        if (value === null || value === undefined) localStorage.removeItem(prefix + key);
        else localStorage.setItem(prefix + key, JSON.stringify(value));
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
