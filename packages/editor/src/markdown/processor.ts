import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify, { type Options as StringifyOptions } from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import type { Root } from 'mdast';

/** User-facing serialization style (docs/SPEC.md §5). */
export interface MarkdownStyle {
  bullet: '-' | '*' | '+';
  emphasis: '*' | '_';
  strong: '*' | '_';
  fence: '`' | '~';
  rule: '-' | '*' | '_';
}

export const defaultMarkdownStyle: MarkdownStyle = {
  bullet: '-',
  emphasis: '*',
  strong: '*',
  fence: '`',
  rule: '-',
};

const parser = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']).use(remarkGfm).use(remarkMath);

export function parseMdast(markdown: string): Root {
  return parser.parse(markdown);
}

export function stringifyMdast(root: Root, style: MarkdownStyle = defaultMarkdownStyle): string {
  const options: StringifyOptions = {
    bullet: style.bullet,
    bulletOther: style.bullet === '*' ? '-' : '*',
    emphasis: style.emphasis,
    strong: style.strong,
    fence: style.fence,
    fences: true,
    rule: style.rule,
    listItemIndent: 'one',
    incrementListMarker: true,
    setext: false,
    closeAtx: false,
    resourceLink: false,
  };
  const processor = unified()
    .use(remarkStringify, options)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath);
  return processor.stringify(root);
}
