/**
 * Export (docs/SPEC.md §13): standalone HTML with the theme CSS inside, PDF through the print dialog, and
 * Word/OpenDocument/RTF/EPUB/LaTeX through Pandoc. Loaded on first use (separate chunk).
 */
import { renderHtml } from '@marktype/editor';
import type { MessageKey, Translate } from '@marktype/i18n';
import {
  PANDOC_NOT_FOUND,
  dirname,
  type ExportFilter,
  type PandocFormat,
  type Platform,
} from '@marktype/platform';
import baseCss from '@marktype/themes/base.css?raw';
import editorCss from '@marktype/editor/editor.css?raw';
import type { Dialogs } from './dialogs.svelte.ts';
import type { DocumentController } from './document.svelte.ts';
import type { ExportFormat, ExportSettings } from './settings.svelte.ts';
import { imageMarkdownSrc, stem } from './images.ts';
import type { ThemeOption } from './theme.svelte.ts';

interface FormatInfo {
  ext: string;
  filter: string;
}

export const FORMATS: Record<ExportFormat, FormatInfo> = {
  html: { ext: 'html', filter: 'HTML' },
  pdf: { ext: 'pdf', filter: 'PDF' },
  docx: { ext: 'docx', filter: 'Word' },
  odt: { ext: 'odt', filter: 'OpenDocument' },
  rtf: { ext: 'rtf', filter: 'RTF' },
  epub: { ext: 'epub', filter: 'EPUB' },
  latex: { ext: 'tex', filter: 'LaTeX' },
};

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

/** MIME type from a path or URL extension. */
export function mimeFor(path: string): string {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(path)?.[1]?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

/** `note.md` → `note.html`; an untitled document uses its tab name. */
export function exportFileName(docName: string, ext: string): string {
  return `${stem(docName) || 'document'}.${ext}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/** Rewrites the relative `url()`s of a stylesheet loaded from `base` (fonts, images next to a theme). */
export async function rewriteCssUrls(
  css: string,
  base: string,
  map: (absolute: string) => Promise<string | null>,
): Promise<string> {
  const replacements = new Map<string, string>();
  for (const match of css.matchAll(CSS_URL)) {
    const url = match[2]!.trim();
    if (replacements.has(url) || url.startsWith('#') || /^(data|https?|blob):/i.test(url)) continue;
    let absolute: string;
    try {
      absolute = new URL(url, base).href;
    } catch {
      continue;
    }
    const mapped = await map(absolute);
    if (mapped) replacements.set(url, mapped);
  }
  if (!replacements.size) return css;
  return css.replace(CSS_URL, (whole, _quote: string, url: string) => {
    const mapped = replacements.get(url.trim());
    return mapped ? `url("${mapped}")` : whole;
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function fetchDataUrl(url: string, maxBytes = 8 * 1024 * 1024): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) return null;
    const type = response.headers.get('content-type')?.split(';')[0] || mimeFor(url);
    return `data:${type};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

async function fetchText(url: string | null): Promise<string> {
  if (!url) return '';
  try {
    const response = await fetch(url);
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
}

/** Extra rules for exported pages: no editor padding, page margins when printing. */
const EXPORT_CSS = `
#write { padding: 40px 48px; }
.md-toc-content .md-toc-item { cursor: auto; }
@media print {
  @page { margin: 16mm 14mm; }
  html, body { background: var(--bg-color, #fff); }
  #write { max-width: none; padding: 0; }
  pre, blockquote, table, figure, img, .md-preview { break-inside: avoid; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
}
`;

export interface ThemeCss {
  theme: ThemeOption;
  baseUserCssUrl: string | null;
}

export interface HtmlPageOptions {
  title: string;
  body: string;
  styles: string[];
  dark: boolean;
  /** Adds the KaTeX stylesheet (from a CDN: its fonts are not embedded). */
  katexVersion: string | null;
}

export function htmlPage(options: HtmlPageOptions): string {
  const katex = options.katexVersion
    ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@${options.katexVersion}/dist/katex.min.css">\n`
    : '';
  const styles = options.styles
    .filter((css) => css.trim())
    .map((css) => `<style>\n${css.replace(/<\/style/gi, '<\\/style')}\n</style>`)
    .join('\n');
  return `<!doctype html>
<html lang="${document.documentElement.lang || 'en'}"${options.dark ? ' class="mt-theme-dark"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MarkType">
<title>${escapeHtml(options.title)}</title>
${katex}${styles}
</head>
<body class="typora-export">
<div class="typora-export-content">
${options.body}
</div>
</body>
</html>
`;
}

export interface ExportContext {
  platform: Platform;
  dialogs: Dialogs;
  t: Translate;
  doc: DocumentController;
  css: ThemeCss;
  settings: ExportSettings;
}

type Target = 'file' | 'print';

/** The document as a standalone page. For `file`, images and theme assets are embedded or made relative to `target`. */
async function buildPage(ctx: ExportContext, mode: Target, target: string | null): Promise<string> {
  const { platform, doc, css, settings } = ctx;
  const rendered = await renderHtml(doc.markdown(), {
    resolveUrl: (src) => platform.resolveAssetUrl(doc.file, src),
  });

  if (mode === 'file') {
    const docPath = doc.file && platform.capabilities.saveInPlace ? doc.file.id : null;
    for (const img of rendered.write.querySelectorAll<HTMLImageElement>('img')) {
      const original = img.dataset.src ?? img.getAttribute('src') ?? '';
      img.removeAttribute('data-src');
      const shown = img.getAttribute('src') ?? '';
      if (/^(https?|data):/i.test(original)) {
        img.src = original;
        continue;
      }
      const local = platform.resolveLocalLink(doc.file, original);
      // Unsaved documents keep their images in a temporary folder: always embed those.
      const embed = settings.embedImages || !docPath || !target || !local;
      if (embed) {
        let data: string | null = null;
        if (local && platform.images) {
          try {
            const bytes = await platform.images.read(local);
            data = `data:${mimeFor(local)};base64,${bytesToBase64(bytes)}`;
          } catch {
            data = null;
          }
        } else if (shown) {
          data = await fetchDataUrl(shown);
        }
        img.src = data ?? original;
      } else {
        img.src = imageMarkdownSrc(target, local);
      }
    }
  }

  // Theme stylesheets: their relative url()s (fonts, images) are embedded in a file export.
  const themeCss = async (url: string | null) => {
    const text = await fetchText(url);
    if (!url) return text;
    // The print frame has no base URL of its own: absolute URLs are enough there.
    const map = mode === 'print' ? async (abs: string) => abs : (abs: string) => fetchDataUrl(abs);
    return rewriteCssUrls(text, new URL(url, location.href).href, map);
  };
  const styles = [
    baseCss,
    editorCss,
    await themeCss(css.theme.url),
    await themeCss(css.baseUserCssUrl),
    await themeCss(css.theme.userCssUrl),
    EXPORT_CSS,
  ];
  return htmlPage({
    title: rendered.title ?? stem(doc.name),
    body: rendered.write.outerHTML,
    styles,
    dark: css.theme.dark,
    katexVersion: rendered.hasMath ? rendered.katexVersion : null,
  });
}

/** Prints `html` from a hidden frame: the system dialog offers "Save as PDF". */
async function printPage(html: string): Promise<void> {
  document.querySelector('iframe.mt-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.className = 'mt-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  const loaded = new Promise<void>((resolve) =>
    frame.addEventListener('load', () => resolve(), { once: true }),
  );
  frame.srcdoc = html;
  document.body.appendChild(frame);
  await loaded;
  const win = frame.contentWindow;
  if (!win) throw new Error('print frame not available');
  const images = [...win.document.images].map((img) => img.decode().catch(() => undefined));
  await Promise.all([win.document.fonts.ready, ...images]);
  win.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 1000), { once: true });
  win.focus();
  win.print();
}

function filterFor(format: ExportFormat): ExportFilter {
  const info = FORMATS[format];
  return { name: info.filter, extensions: [info.ext] };
}

async function alert(ctx: ExportContext, key: MessageKey, params?: Record<string, string>) {
  await ctx.dialogs.alert(ctx.t('export.title'), ctx.t(key, params), ctx.t('dialog.ok'));
}

/** Tells the user where the file went and offers to open it. */
async function done(ctx: ExportContext, target: string) {
  const open = ctx.platform.export.open;
  if (!open) return;
  const choice = await ctx.dialogs.confirm(ctx.t('export.title'), ctx.t('export.done', { path: target }), [
    { id: 'open', label: ctx.t('export.open'), primary: true },
    { id: 'ok', label: ctx.t('dialog.ok'), cancel: true },
  ]);
  if (choice === 'open') await open(target).catch(() => undefined);
}

export async function exportDocument(ctx: ExportContext, format: ExportFormat): Promise<void> {
  const { platform, doc, t } = ctx;
  try {
    if (format === 'pdf') {
      const printPdf = platform.export.printPdf;
      if (!printPdf) {
        await printPage(await buildPage(ctx, 'print', null));
        return;
      }
      // Windows: straight to a file. The page is self-contained (it is loaded from a temporary folder).
      const target = await platform.export.pickTarget(exportFileName(doc.name, 'pdf'), filterFor('pdf'));
      if (!target) return;
      const html = await buildPage(
        { ...ctx, settings: { ...ctx.settings, embedImages: true } },
        'file',
        target,
      );
      // The header shows the page <title> (first heading or file name).
      await printPdf({ html, output: target, headerFooter: ctx.settings.pdfHeaderFooter, title: '' });
      await done(ctx, target);
      return;
    }
    const target = await platform.export.pickTarget(
      exportFileName(doc.name, FORMATS[format].ext),
      filterFor(format),
    );
    if (!target) return;
    if (format === 'html') {
      await platform.export.writeText(target, await buildPage(ctx, 'file', target));
      await done(ctx, target);
      return;
    }
    const pandoc = platform.export.pandoc;
    if (!pandoc) return;
    const docPath = doc.file && platform.capabilities.saveInPlace ? doc.file.id : null;
    await pandoc.run({
      pandoc: ctx.settings.pandocPath,
      markdown: doc.markdown(),
      format: format as PandocFormat,
      output: target,
      resourceDir: docPath ? dirname(docPath) : null,
    });
    await done(ctx, target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === PANDOC_NOT_FOUND) await alert(ctx, 'export.pandocMissing');
    else await alert(ctx, 'export.error', { message: message.split('\n').slice(0, 6).join('\n') });
  } finally {
    doc.focus();
  }
}

/** For the settings panel: `pandoc 3.6.2`, or null. */
export async function pandocVersion(platform: Platform, path: string): Promise<string | null> {
  return (await platform.export.pandoc?.version(path).catch(() => null)) ?? null;
}
