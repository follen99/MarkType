import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { hasUrlScheme, type FileRef, type FileStamp, type OsName, type Platform } from '@marktype/platform';
import { basename, decodePathComponent, dirname, isAbsolutePath, resolvePath } from './paths.ts';

interface AppInfo {
  version: string;
  os: string;
}

type RustWriteResult = { status: 'ok'; stamp: FileStamp } | { status: 'conflict'; current: FileStamp | null };

const KNOWN_OS: readonly OsName[] = ['windows', 'macos', 'linux', 'android', 'ios'];
const MARKDOWN_FILTER = { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'txt'] };

const fileRef = (path: string): FileRef => ({ id: path, name: basename(path) });

export async function createTauriPlatform(): Promise<Platform> {
  const info = await invoke<AppInfo>('app_info');
  const os = (KNOWN_OS as readonly string[]).includes(info.os) ? (info.os as OsName) : 'unknown';
  const win = getCurrentWindow();
  const webview = getCurrentWebview();

  return {
    kind: 'desktop',
    os,
    appVersion: info.version,
    capabilities: { windowControls: true, folders: true, saveInPlace: true },
    window: {
      minimize: () => win.minimize(),
      toggleMaximize: () => win.toggleMaximize(),
      close: () => win.close(),
      isMaximized: () => win.isMaximized(),
      setTitle: (title) => win.setTitle(title),
      setFullscreen: (fullscreen) => win.setFullscreen(fullscreen),
      setZoom: (factor) => webview.setZoom(factor),
      onResized: (cb) => win.onResized(() => cb()),
      onCloseRequested: (guard) =>
        win.onCloseRequested(async (event) => {
          if (guard.hasUnsavedChanges() && !(await guard.confirmClose())) event.preventDefault();
        }),
    },
    files: {
      async pickOpen() {
        const path = await open({ multiple: false, directory: false, filters: [MARKDOWN_FILTER] });
        return typeof path === 'string' ? fileRef(path) : null;
      },
      async pickSave(suggestedName) {
        const path = await save({ defaultPath: suggestedName, filters: [MARKDOWN_FILTER] });
        return path ? fileRef(path) : null;
      },
      read: (file) => invoke('read_text_file', { path: file.id }),
      async write(file, text, expected) {
        const result = await invoke<RustWriteResult>('write_text_file', { path: file.id, text, expected });
        return result.status === 'ok' ? { status: 'ok', stamp: result.stamp } : { status: 'conflict' };
      },
    },
    resolveAssetUrl(doc, src) {
      if (!src || hasUrlScheme(src) || src.startsWith('//')) return src;
      const decoded = decodePathComponent(src);
      if (isAbsolutePath(decoded)) return convertFileSrc(decoded);
      if (!doc) return src;
      return convertFileSrc(resolvePath(dirname(doc.id), decoded));
    },
    openExternal: (url) => openUrl(url),
  };
}
