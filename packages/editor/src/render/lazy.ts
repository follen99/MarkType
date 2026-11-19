/**
 * Heavy renderers, each loaded the first time a document needs it (separate chunks, bundled with the
 * app so they also work offline).
 */

type Katex = typeof import('katex').default;
type Mermaid = typeof import('mermaid').default;
type Purify = typeof import('dompurify').default;

let katex: Katex | null = null;
let katexLoading: Promise<Katex> | null = null;

export function getKatex(): Katex | null {
  return katex;
}

export function loadKatex(): Promise<Katex> {
  katexLoading ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([module]) => {
    katex = module.default;
    return katex;
  });
  return katexLoading;
}

/** Renders TeX to HTML. Errors are shown inline in red instead of throwing. */
export function renderTex(lib: Katex, tex: string, displayMode: boolean): string {
  return lib.renderToString(tex, { displayMode, throwOnError: false, output: 'htmlAndMathml', trust: false });
}

let mermaid: Promise<Mermaid> | null = null;
let mermaidTheme = '';

function isDarkBackground(): boolean {
  const color = getComputedStyle(document.body).backgroundColor;
  const [r = 255, g = 255, b = 255] = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function loadMermaid(): Promise<Mermaid> {
  mermaid ??= import('mermaid').then((module) => module.default);
  return mermaid.then((lib) => {
    const theme = isDarkBackground() ? 'dark' : 'default';
    if (theme !== mermaidTheme) {
      lib.initialize({ startOnLoad: false, securityLevel: 'strict', theme, fontFamily: 'inherit' });
      mermaidTheme = theme;
    }
    return lib;
  });
}

let renderCount = 0;

/** Renders a Mermaid diagram to SVG markup; rejects with a readable message on syntax errors. */
export async function renderMermaid(code: string): Promise<string> {
  const lib = await loadMermaid();
  const id = `mt-mermaid-${++renderCount}`;
  try {
    const { svg } = await lib.render(id, code);
    return svg;
  } finally {
    // Mermaid leaves a temporary element behind when rendering fails.
    document.getElementById(id)?.remove();
    document.getElementById(`d${id}`)?.remove();
  }
}

let purify: Promise<Purify> | null = null;

export function loadPurify(): Promise<Purify> {
  purify ??= import('dompurify').then((module) => module.default);
  return purify;
}

let emojiNames: Record<string, string> | null = null;
let emojiLoading: Promise<Record<string, string>> | null = null;

export function getEmoji(): Record<string, string> | null {
  return emojiNames;
}

export function loadEmoji(): Promise<Record<string, string>> {
  emojiLoading ??= import('gemoji').then((module) => {
    emojiNames = module.nameToEmoji;
    return emojiNames;
  });
  return emojiLoading;
}
