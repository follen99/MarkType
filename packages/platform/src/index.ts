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

export interface Platform {
  readonly kind: PlatformKind;
  readonly os: OsName;
  readonly appVersion: string;
  readonly capabilities: PlatformCapabilities;
  readonly window: WindowApi;
  readonly files: FilesApi;
  /** URL the webview can load for an image `src` written in the document `doc`. */
  resolveAssetUrl(doc: FileRef | null, src: string): string;
  openExternal(url: string): Promise<void>;
}

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for `https:`, `data:`, `mailto:`… but not for Windows drive paths like `C:\`. */
export function hasUrlScheme(src: string): boolean {
  return URL_SCHEME.test(src) && !/^[a-z]:[\\/]/i.test(src);
}
