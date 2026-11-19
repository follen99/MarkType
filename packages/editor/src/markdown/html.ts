/**
 * Pasted HTML (web pages, Word, …) → markdown (docs/SPEC.md §11). The HTML parser and the hast → mdast
 * converter are loaded the first time something is pasted (separate chunk).
 */
import type { Root } from 'mdast';
import { defaultMarkdownStyle, stringifyMdast, type MarkdownStyle } from './processor.ts';

type Converter = (html: string) => Promise<Root>;

let converter: Promise<Converter> | null = null;

function loadConverter(): Promise<Converter> {
  converter ??= Promise.all([import('unified'), import('rehype-parse'), import('rehype-remark')]).then(
    ([{ unified }, { default: rehypeParse }, { default: rehypeRemark }]) => {
      const processor = unified().use(rehypeParse, { fragment: true }).use(rehypeRemark);
      return async (html: string) => (await processor.run(processor.parse(html))) as Root;
    },
  );
  return converter;
}

/** Drops what the Windows clipboard and Office add around the copied fragment. */
function cleanHtml(html: string): string {
  const start = html.indexOf('<!--StartFragment-->');
  const end = html.indexOf('<!--EndFragment-->');
  const fragment = start >= 0 && end > start ? html.slice(start + 20, end) : html;
  return fragment
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<(style|script|head|meta|title)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?o:p>/gi, '');
}

/** True when the HTML has visible text (not just an `<img>` around a copied picture). */
export function htmlHasText(html: string): boolean {
  const text = cleanHtml(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .trim();
  return text.length > 0;
}

export async function htmlToMarkdown(
  html: string,
  style: MarkdownStyle = defaultMarkdownStyle,
): Promise<string> {
  const convert = await loadConverter();
  const root = await convert(cleanHtml(html));
  return stringifyMdast(root, style);
}
