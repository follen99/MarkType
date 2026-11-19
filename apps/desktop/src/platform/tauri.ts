import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  basename,
  decodePathComponent,
  dirname,
  hasUrlScheme,
  isAbsolutePath,
  localPrefs,
  resolvePath,
  type FileRef,
  type FileStamp,
  type FolderEntry,
  type OsName,
  type Platform,
} from '@marktype/platform';

interface AppInfo {
  version: string;
  os: string;
}

interface RustThemeList {
  dir: string;
  themes: { id: string; name: string; path: string; dark: boolean; userCss: string | null }[];
  baseUserCss: string | null;
}

type RustWriteResult = { status: 'ok'; stamp: FileStamp } | { status: 'conflict'; current: FileStamp | null };

const KNOWN_OS: readonly OsName[] = ['windows', 'macos', 'linux', 'android', 'ios'];
const MARKDOWN_FILTER = { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'txt'] };

const fileRef = (path: string): FileRef => ({ id: path, name: basename(path) });

/**
 * Asset-protocol URL that keeps the folder structure visible (`convertFileSrc` encodes the separators too),
 * so relative `url('./my-theme/font.woff')` inside a stylesheet resolves next to it. Tauri decodes and
 * canonicalizes the path, so forward slashes work on Windows; `/Users/x` becomes `localhost//Users/x`.
 */
function assetUrlWithDirs(path: string): string {
  return convertFileSrc('') + path.split(/[\\/]/).map(encodeURIComponent).join('/');
}

/** Local file a markdown path refers to, relative to the document `doc`. */
function localPath(doc: FileRef | null, src: string): string | null {
  if (!src || hasUrlScheme(src) || src.startsWith('//') || src.startsWith('#')) return null;
  const decoded = decodePathComponent(src.split('#')[0]!);
  if (isAbsolutePath(decoded)) return decoded;
  return doc ? resolvePath(dirname(doc.id), decoded) : null;
}

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
    folders: {
      async pick() {
        const path = await open({ multiple: false, directory: true });
        return typeof path === 'string' ? path : null;
      },
      open: (path) => invoke<FolderEntry[]>('open_folder', { path }),
      list: (path) => invoke<FolderEntry[]>('list_dir', { path }),
      markdownFiles: (root) => invoke<string[]>('list_markdown_files', { root }),
      search: (root, options) => invoke('search_folder', { root, options }),
      createFile: (dir, name) => invoke<string>('create_file_in', { dir, name }),
      createFolder: (dir, name) => invoke<string>('create_folder_in', { dir, name }),
      rename: (path, newName) => invoke<string>('rename_path', { path, newName }),
      move: (path, targetDir) => invoke<string>('move_path', { path, targetDir }),
      trash: (path) => invoke('trash_path', { path }),
      fileRef,
    },
    drafts: {
      save: (draft) => invoke('save_draft', { draft }),
      remove: (id) => invoke('remove_draft', { id }),
      list: () => invoke('list_drafts'),
    },
    themes: {
      async list() {
        const result = await invoke<RustThemeList>('list_themes');
        const url = (path: string | null) => (path ? assetUrlWithDirs(path) : null);
        return {
          themes: result.themes.map((theme) => ({
            id: theme.id,
            name: theme.name,
            url: assetUrlWithDirs(theme.path),
            dark: theme.dark,
            userCssUrl: url(theme.userCss),
          })),
          baseUserCssUrl: url(result.baseUserCss),
        };
      },
      async onChange(cb) {
        const unlisten = await listen('themes-changed', () => cb());
        await invoke('watch_themes');
        return unlisten;
      },
      openFolder: () => invoke('open_themes_folder'),
    },
    prefs: localPrefs('marktype.'),
    resolveAssetUrl(doc, src) {
      const path = localPath(doc, src);
      if (path) return convertFileSrc(path);
      return src;
    },
    resolveLocalLink: (doc, href) => localPath(doc, href),
    openExternal: (url) => openUrl(url),
  };
}
