import { parseMarkdown } from './markdown/parse.ts';
import { defaultMarkdownStyle } from './markdown/processor.ts';
import { getKatex } from './render/lazy.ts';
import { createWysiwygView } from './wysiwyg/view.ts';

/**
 * Renders a document the way the editor shows it (Typora DOM: `#write` with `md-*` classes, highlighted
 * code, rendered math and diagrams), without the editing UI, for HTML/PDF export (docs/SPEC.md §13).
 */

export interface RenderHtmlOptions {
  /** URL the page can load for an image `src` (asset protocol on desktop). */
  resolveUrl(src: string): string;
  /** Page width while rendering, in CSS pixels: diagrams are laid out at this width. */
  width?: number;
  /** Upper bound for lazy renderers (Mermaid, KaTeX, highlighting) to finish. */
  timeoutMs?: number;
}

export interface RenderedHtml {
  /** The `#write` element, detached; images keep their markdown `src` in `data-src`. */
  write: HTMLElement;
  /** Text of the first level-1 heading. */
  title: string | null;
  hasMath: boolean;
  /** Version of the KaTeX used to render the math (its stylesheet must match). */
  katexVersion: string | null;
}

const QUIET_MS = 250;

/** A preview whose renderer has not produced anything yet. */
function hasPendingPreview(root: HTMLElement): boolean {
  return !!root.querySelector('.md-has-preview > .md-preview:empty:not(.md-preview-empty)');
}

/** Resolves once nothing changed in `root` for a moment (lazy chunks loaded, previews drawn). */
function settle(root: HTMLElement, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      observer.disconnect();
      clearTimeout(quiet);
      clearTimeout(limit);
      resolve();
    };
    const restart = () => {
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        if (hasPendingPreview(root) && Date.now() - start < timeoutMs) restart();
        else done();
      }, QUIET_MS);
    };
    const observer = new MutationObserver(restart);
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    const limit = setTimeout(done, timeoutMs);
    restart();
  });
}

/** Heading text → `id` (lowercase, dashes), unique within the document. */
export function slugify(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  let slug = base;
  for (let i = 1; used.has(slug); i++) slug = `${base}-${i}`;
  used.add(slug);
  return slug;
}

const UI_SELECTOR = [
  '.md-fences-lang-wrap',
  '.md-table-edit',
  '.md-hidden-source',
  '.md-meta-block',
  '.ProseMirror-gapcursor',
  '.ProseMirror-separator',
  '.ProseMirror-trailingBreak',
].join(',');

/** Strips editing UI and attributes from a clone of `#write`. */
export function cleanExportDom(write: HTMLElement): void {
  for (const el of write.querySelectorAll(UI_SELECTOR)) el.remove();
  // Diagrams, math blocks and HTML blocks: keep the rendering, drop the source.
  for (const pre of write.querySelectorAll<HTMLElement>('pre.md-has-preview')) {
    const preview = pre.querySelector<HTMLElement>(':scope > .md-preview');
    if (!preview || preview.classList.contains('md-preview-empty')) {
      pre.remove();
      continue;
    }
    preview.style.removeProperty('font-family');
    if (!preview.getAttribute('style')) preview.removeAttribute('style');
    pre.replaceWith(preview);
  }
  for (const box of write.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    box.setAttribute('disabled', '');
  }
  for (const el of [write, ...write.querySelectorAll<HTMLElement>('*')]) {
    for (const attr of ['contenteditable', 'spellcheck', 'draggable', 'data-pos', 'data-from', 'translate']) {
      el.removeAttribute(attr);
    }
    el.classList.remove('md-focus', 'md-img-loaded', 'ProseMirror-selectednode', 'ProseMirror-widget');
    if (el.classList.length === 0) el.removeAttribute('class');
  }
  // Headings get ids; the [toc] entries (same order) link to them.
  const used = new Set<string>();
  const headings = [...write.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')];
  for (const heading of headings) heading.id = slugify(heading.textContent ?? '', used);
  for (const toc of write.querySelectorAll('.md-toc')) {
    const links = toc.querySelectorAll<HTMLAnchorElement>('a.md-toc-inner');
    links.forEach((link, i) => {
      const heading = headings[i];
      if (heading) link.href = `#${heading.id}`;
    });
  }
  write.removeAttribute('class');
  write.id = 'write';
}

export async function renderHtml(markdown: string, options: RenderHtmlOptions): Promise<RenderedHtml> {
  const host = document.createElement('div');
  host.className = 'mt-export-render';
  host.setAttribute('aria-hidden', 'true');
  // Laid out (Mermaid measures text) but off screen.
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${options.width ?? 860}px;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(host);
  const view = createWysiwygView(host, parseMarkdown(markdown), {
    style: defaultMarkdownStyle,
    editable: false,
    resolveUrl: options.resolveUrl,
    openLink: () => {},
  });
  try {
    await settle(view.dom as HTMLElement, options.timeoutMs ?? 15_000);
    const write = view.dom.cloneNode(true) as HTMLElement;
    cleanExportDom(write);
    const title = write.querySelector('h1')?.textContent?.trim() || null;
    const katex = getKatex() as { version?: string } | null;
    return { write, title, hasMath: !!write.querySelector('.katex'), katexVersion: katex?.version ?? null };
  } finally {
    view.destroy();
    host.remove();
  }
}
