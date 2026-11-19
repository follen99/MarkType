import type { FileRef, OsName, Platform } from '@marktype/platform';

declare const __APP_VERSION__: string;

function detectOs(): OsName {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Mac/i.test(ua)) return 'macos';
  if (/Win/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'unknown';
}

// Minimal File System Access API typing (Chromium only).
interface FsFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FsFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FsFileHandle>;
};

const PICKER_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }];

/** Opened files: a File System Access handle when available, otherwise the File from <input type=file>. */
const entries = new Map<string, { handle?: FsFileHandle; file?: File }>();
let nextId = 1;

function register(name: string, entry: { handle?: FsFileHandle; file?: File }): FileRef {
  const id = `web-${nextId++}`;
  entries.set(id, entry);
  return { id, name };
}

function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** Browser implementation of Platform (phase 2 adds .zip packages for pasted images). */
export function createWebPlatform(): Platform {
  const w = window as PickerWindow;
  const canPick = typeof w.showOpenFilePicker === 'function';

  return {
    kind: 'web',
    os: detectOs(),
    appVersion: __APP_VERSION__,
    capabilities: { windowControls: false, folders: false, saveInPlace: canPick },
    window: {
      // The browser owns the window: these are no-ops except title, fullscreen and zoom.
      minimize: async () => {},
      toggleMaximize: async () => {},
      close: async () => {},
      isMaximized: async () => false,
      setTitle: async (title) => {
        document.title = title;
      },
      setFullscreen: async (fullscreen) => {
        if (fullscreen) await document.documentElement.requestFullscreen?.();
        else if (document.fullscreenElement) await document.exitFullscreen();
      },
      setZoom: async (factor) => {
        document.documentElement.style.setProperty('zoom', String(factor));
      },
      onResized: async (cb) => {
        window.addEventListener('resize', cb);
        return () => window.removeEventListener('resize', cb);
      },
      onCloseRequested: async (guard) => {
        // Browsers only allow their own generic "leave site?" confirmation.
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
          if (guard.hasUnsavedChanges()) event.preventDefault();
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
      },
    },
    files: {
      async pickOpen() {
        if (canPick) {
          try {
            const [handle] = await w.showOpenFilePicker!({ types: PICKER_TYPES });
            return handle ? register(handle.name, { handle }) : null;
          } catch (error) {
            if (isAbort(error)) return null;
            throw error;
          }
        }
        const file = await pickWithInput();
        return file ? register(file.name, { file }) : null;
      },
      async pickSave(suggestedName) {
        if (typeof w.showSaveFilePicker === 'function') {
          try {
            const handle = await w.showSaveFilePicker({ suggestedName, types: PICKER_TYPES });
            return register(handle.name, { handle });
          } catch (error) {
            if (isAbort(error)) return null;
            throw error;
          }
        }
        return register(suggestedName, {});
      },
      async read(ref) {
        const entry = entries.get(ref.id);
        const file = entry?.file ?? (await entry?.handle?.getFile());
        if (!file) throw new Error(`Unknown file ${ref.name}`);
        return { text: await file.text(), stamp: null };
      },
      async write(ref, text) {
        const handle = entries.get(ref.id)?.handle;
        if (handle) {
          const writable = await handle.createWritable();
          await writable.write(text);
          await writable.close();
        } else {
          download(ref.name, text);
        }
        return { status: 'ok', stamp: null };
      },
    },
    // Relative images cannot be read from a single opened file; they load only if they are URLs.
    resolveAssetUrl: (_doc, src) => src,
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
  };
}
