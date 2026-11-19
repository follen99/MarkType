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
  memoryPrefs,
  resolvePath,
  type FileRef,
  type FileStamp,
  type FolderEntry,
  type LaunchPath,
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
const IMAGE_FILTER = {
  name: 'Images',
  extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'tif', 'tiff'],
};

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

interface LoadedSettings {
  values: Record<string, unknown> | null;
  error: string | null;
  path: string;
}

const PREFS_PREFIX = 'marktype.';
const MIGRATED_FLAG = `${PREFS_PREFIX}migratedToSettingsJson`;

/** Preferences kept in localStorage up to v0.5, moved once into settings.json. */
function legacyPrefs(): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return values;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFS_PREFIX) || key === MIGRATED_FLAG) continue;
      try {
        values[key.slice(PREFS_PREFIX.length)] = JSON.parse(localStorage.getItem(key) ?? 'null');
      } catch {
        // not JSON: not one of ours
      }
    }
  } catch {
    // storage unavailable
  }
  return values;
}

/** settings.json, created on first run from the old localStorage preferences. */
async function loadSettings() {
  const loaded = await invoke<LoadedSettings>('load_settings');
  const persist = (patch: Record<string, unknown>) => invoke<void>('update_settings', { patch });
  let values = loaded.values;
  if (!values && !loaded.error) {
    values = legacyPrefs();
    await persist(values);
    try {
      localStorage.setItem(MIGRATED_FLAG, 'true');
    } catch {
      // storage unavailable
    }
  }
  // A broken file is left alone: defaults for this session, nothing written.
  const prefs = memoryPrefs(values ?? {}, loaded.error ? null : persist);
  return { prefs, path: loaded.path, error: loaded.error };
}

export async function createTauriPlatform(): Promise<Platform> {
  const [info, settings] = await Promise.all([invoke<AppInfo>('app_info'), loadSettings()]);
  const { prefs } = settings;
  const os = (KNOWN_OS as readonly string[]).includes(info.os) ? (info.os as OsName) : 'unknown';
  const win = getCurrentWindow();
  const webview = getCurrentWebview();
  let pendingRoot: Promise<string> | undefined;

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
          else await prefs.flush();
        }),
      // Tauri takes file drops from the OS (with their paths) instead of the page; positions are physical.
      onFileDrop: (cb) =>
        webview.onDragDropEvent(({ payload }) => {
          if (payload.type !== 'drop' || !payload.paths.length) return;
          const ratio = window.devicePixelRatio || 1;
          cb({ paths: payload.paths, x: payload.position.x / ratio, y: payload.position.y / ratio });
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
    images: {
      save(dir, name, bytes) {
        const headers = { 'x-dir': encodeURIComponent(dir), 'x-name': encodeURIComponent(name) };
        return invoke<string>('save_image', bytes, { headers });
      },
      move: (path, dir) => invoke<string>('move_image', { path, dir }),
      async read(path) {
        return new Uint8Array(await invoke<ArrayBuffer>('read_image_file', { path }));
      },
      async pick() {
        const paths = await open({ multiple: true, directory: false, filters: [IMAGE_FILTER] });
        return paths ?? [];
      },
      pendingRoot: () => (pendingRoot ??= invoke<string>('pending_images_root')),
      discardPending: (docId) => invoke('discard_pending_images', { id: docId }),
    },
    prefs,
    config: {
      settingsPath: settings.path,
      settingsError: settings.error,
      keybindings: () => invoke<Record<string, unknown>>('read_keybindings'),
      openFile: (name) => invoke('open_config_file', { name }),
    },
    launch: {
      initial: () => invoke<LaunchPath[]>('take_launch_paths'),
      onOpen: (cb) => listen<LaunchPath[]>('open-paths', ({ payload }) => cb(payload)),
    },
    export: {
      async pickTarget(suggestedName, filter) {
        return (await save({ defaultPath: suggestedName, filters: [filter] })) ?? null;
      },
      async writeText(path, text) {
        await invoke('write_text_file', { path, text, expected: null });
      },
      open: (path) => invoke('open_export', { path }),
      pandoc: {
        version: (pandocPath) => invoke<string | null>('pandoc_version', { path: pandocPath }),
        async run(job) {
          await invoke('pandoc_export', { job });
        },
      },
    },
    resolveAssetUrl(doc, src) {
      const path = localPath(doc, src);
      if (path) return convertFileSrc(path);
      return src;
    },
    resolveLocalLink: (doc, href) => localPath(doc, href),
    openExternal: (url) => openUrl(url),
  };
}
