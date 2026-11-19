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
}

export type Unsubscribe = () => void;

export interface WindowApi {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  /** Called whenever the window is resized (maximized state may have changed). */
  onResized(cb: () => void): Promise<Unsubscribe>;
}

export interface Platform {
  readonly kind: PlatformKind;
  readonly os: OsName;
  readonly appVersion: string;
  readonly capabilities: PlatformCapabilities;
  readonly window: WindowApi;
}
