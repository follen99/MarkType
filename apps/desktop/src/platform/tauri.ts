import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { OsName, Platform } from '@marktype/platform';

interface AppInfo {
  version: string;
  os: string;
}

const KNOWN_OS: readonly OsName[] = ['windows', 'macos', 'linux', 'android', 'ios'];

export async function createTauriPlatform(): Promise<Platform> {
  const info = await invoke<AppInfo>('app_info');
  const os = (KNOWN_OS as readonly string[]).includes(info.os) ? (info.os as OsName) : 'unknown';
  const win = getCurrentWindow();

  return {
    kind: 'desktop',
    os,
    appVersion: info.version,
    capabilities: { windowControls: true, folders: true },
    window: {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      isMaximized: () => win.isMaximized(),
      setTitle: (title) => win.setTitle(title),
      onResized: (cb) => win.onResized(() => cb()),
    },
  };
}
