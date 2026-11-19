/**
 * Where pasted, dropped and inserted images go and how they are named (docs/SPEC.md §10). Pure functions:
 * the platform only writes the bytes (and picks `-1`, `-2`… suffixes so nothing is ever overwritten).
 */
import { basename, dirname, isAbsolutePath, resolvePath, type PrefsApi } from '@marktype/platform';

/** An image to store: a pasted/dropped file (no path) or a file on disk. */
export interface ImageInput {
  name: string;
  /** MIME type, '' when unknown. */
  type: string;
  path: string | null;
  read(): Promise<Uint8Array>;
}

export type ImageDestination = 'assets' | 'filenameAssets' | 'custom' | 'none';

export interface ImageSettings {
  destination: ImageDestination;
  /** For `custom`: relative to the document or absolute; may contain `${filename}`. */
  customFolder: string;
  /** File name without extension; tokens `${filename}`, `${date}`, `${time}`, `${timestamp}`, `${hash}`, `${original}`. */
  pattern: string;
  /** Ask for the file name every time. */
  askName: boolean;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  destination: 'assets',
  customFolder: '',
  pattern: '${filename}-${timestamp}',
  askName: false,
};

const DESTINATIONS: readonly ImageDestination[] = ['assets', 'filenameAssets', 'custom', 'none'];

export function loadImageSettings(prefs: PrefsApi): ImageSettings {
  const stored = prefs.get<Partial<ImageSettings>>('images', {});
  return {
    destination: DESTINATIONS.includes(stored.destination as ImageDestination)
      ? (stored.destination as ImageDestination)
      : DEFAULT_IMAGE_SETTINGS.destination,
    customFolder: typeof stored.customFolder === 'string' ? stored.customFolder : '',
    pattern:
      typeof stored.pattern === 'string' && stored.pattern.trim()
        ? stored.pattern
        : DEFAULT_IMAGE_SETTINGS.pattern,
    askName: stored.askName === true,
  };
}

/** File name without its last extension. */
export function stem(name: string): string {
  const base = basename(name);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/** `typora-copy-images-to` from the YAML front matter, if any. */
export function frontMatterCopyTo(markdown: string): string | null {
  const match = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec(markdown);
  if (!match) return null;
  const line = /^typora-copy-images-to:[ \t]*(.*?)[ \t]*$/m.exec(match[1]!);
  if (!line) return null;
  const value = line[1]!.replace(/^(['"])(.*)\1$/, '$2').trim();
  return value || null;
}

function folderFrom(docPath: string, folder: string): string {
  const expanded = folder.replaceAll('${filename}', stem(docPath));
  return isAbsolutePath(expanded) ? expanded : resolvePath(dirname(docPath), expanded);
}

/**
 * Absolute folder for the images of the document at `docPath`, or null when images are not copied.
 * The front matter value (`typora-copy-images-to`) overrides the settings.
 */
export function imageFolder(
  docPath: string,
  settings: ImageSettings,
  frontMatter: string | null,
): string | null {
  if (frontMatter) return folderFrom(docPath, frontMatter);
  switch (settings.destination) {
    case 'assets':
      return folderFrom(docPath, './assets');
    case 'filenameAssets':
      return folderFrom(docPath, './${filename}.assets');
    case 'custom':
      return settings.customFolder.trim() ? folderFrom(docPath, settings.customFolder.trim()) : null;
    case 'none':
      return null;
  }
}

export interface NameContext {
  /** Document name without extension. */
  filename: string;
  /** Name of the original file without extension (`image` for screenshots). */
  original: string;
  date: Date;
  /** Short content hash; only computed when the pattern uses `${hash}`. */
  hash: string;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function expandNamePattern(pattern: string, ctx: NameContext): string {
  const d = ctx.date;
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const timestamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}`;
  const tokens: Record<string, string> = {
    filename: ctx.filename,
    original: ctx.original,
    date,
    time,
    timestamp,
    hash: ctx.hash,
  };
  return pattern.replace(/\$\{(\w+)\}/g, (all, token: string) => tokens[token] ?? all);
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A file name safe on every OS (and in a markdown path): no separators, reserved or control characters. */
export function sanitizeFileName(name: string): string {
  let clean = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*#%\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (clean.length > 120) clean = clean.slice(0, 120).trim();
  if (!clean || clean.startsWith('.')) clean = `image${clean}`;
  if (WINDOWS_RESERVED.test(clean)) clean += '-';
  return clean;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
};

export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'avif',
  'ico',
  'tif',
  'tiff',
]);

export function isImageName(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Extension (without dot) for an image: from its name when it has an image extension, else from the MIME type. */
export function imageExtension(name: string, type: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (IMAGE_EXTENSIONS.has(ext)) return ext;
  return MIME_EXTENSIONS[type.toLowerCase()] ?? 'png';
}

/** Percent-encodes what would break or change a markdown link destination: spaces, `%`, `#`, `?`, brackets. */
export function encodeImagePath(path: string): string {
  return path.replace(
    /[ %#?()<>[\]\t]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

const driveOf = (path: string) => (/^([a-z]):/i.exec(path)?.[1] ?? '').toLowerCase();

/**
 * Markdown `src` for the image at `imagePath` in the document at `docPath`: relative with `/` and encoded
 * spaces; absolute (with `/`) for unsaved documents or images on another drive.
 */
export function imageMarkdownSrc(docPath: string | null, imagePath: string): string {
  const image = imagePath.replace(/\\/g, '/');
  if (!docPath || driveOf(docPath) !== driveOf(imagePath) || image.startsWith('//'))
    return encodeImagePath(image);
  const from = dirname(docPath).replace(/\\/g, '/').split('/');
  const to = image.split('/');
  let common = 0;
  while (
    common < from.length &&
    common < to.length - 1 &&
    from[common]!.toLowerCase() === to[common]!.toLowerCase()
  )
    common++;
  // Nothing in common below the root: keep it absolute.
  if (common === 0 || (common === 1 && from[0] === '')) return encodeImagePath(image);
  const relative = [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/');
  return encodeImagePath(relative);
}

/** First 8 hex digits of the SHA-256 of `bytes`. */
export async function shortHash(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  return Array.from(digest.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}
