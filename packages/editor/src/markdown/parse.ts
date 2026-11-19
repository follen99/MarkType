import type { Mark, Node as PMNode } from 'prosemirror-model';
import type * as md from 'mdast';
import {
  ALERT_TYPES,
  HTML_TAG_MARKS,
  schema,
  type AlertType,
  type CellAlign,
  type RawBlockKind,
  type RawInlineKind,
} from '../schema.ts';
import { parseMdast } from './processor.ts';

const HTML_TAG = /^<(\/?)([a-z]+)\s*>$/i;
const HTML_BREAK = /^<br\s*\/?>$/i;
const HIGHLIGHT = /==(?=\S)([^=]*?\S)==/g;
const TAG_MARKS = new Set<string>(HTML_TAG_MARKS);

/** The mark an inline HTML tag becomes, or null if it stays raw source. */
function htmlTagMark(tag: string): Mark | null {
  if (tag === 'u') return schema.marks.underline.create();
  return TAG_MARKS.has(tag) ? schema.marks.htmltag.create({ tag }) : null;
}

/** Splits `==highlight==` out of plain text. */
function textWithHighlights(value: string, marks: readonly Mark[]): PMNode[] {
  if (!value.includes('==')) return textNode(value, marks);
  const out: PMNode[] = [];
  let index = 0;
  for (const m of value.matchAll(HIGHLIGHT)) {
    out.push(...textNode(value.slice(index, m.index), marks));
    out.push(...textNode(m[1]!, schema.marks.highlight.create().addToSet(marks)));
    index = m.index + m[0].length;
  }
  out.push(...textNode(value.slice(index), marks));
  return out;
}

interface Ctx {
  source: string;
}

function sourceOf(node: md.Node, ctx: Ctx): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start !== undefined && end !== undefined ? ctx.source.slice(start, end) : '';
}

function textNode(text: string, marks: readonly Mark[]): PMNode[] {
  return text ? [schema.text(text, marks)] : [];
}

function rawBlock(kind: RawBlockKind, text: string): PMNode {
  return schema.nodes.raw_block.create({ kind }, text ? schema.text(text) : null);
}

function rawInline(kind: RawInlineKind, text: string, marks: readonly Mark[]): PMNode[] {
  return textNode(text, schema.marks.raw.create({ kind }).addToSet(marks));
}

// ---------- inline ----------

function convertInline(children: readonly md.PhrasingContent[], marks: readonly Mark[], ctx: Ctx): PMNode[] {
  const out: PMNode[] = [];
  // Inline HTML opening tags that became marks, waiting for their closing tag.
  const open: { tag: string; mark: Mark }[] = [];
  const current = () => open.reduce<readonly Mark[]>((set, o) => o.mark.addToSet(set), marks);

  const tagOf = (node: md.PhrasingContent) => {
    if (node.type !== 'html') return null;
    const m = HTML_TAG.exec(node.value.trim());
    return m ? { closing: !!m[1], tag: m[2]!.toLowerCase() } : null;
  };

  children.forEach((child, index) => {
    if (child.type === 'html') {
      const value = child.value.trim();
      if (HTML_BREAK.test(value)) {
        out.push(schema.nodes.hard_break.create({ raw: child.value }, null, current()));
        return;
      }
      const parsed = tagOf(child);
      const mark = parsed && htmlTagMark(parsed.tag);
      if (parsed && mark) {
        if (!parsed.closing) {
          // Only a tag closed later in the same paragraph becomes formatting.
          const closed = children.slice(index + 1).some((c) => {
            const t = tagOf(c);
            return t?.closing && t.tag === parsed.tag;
          });
          if (closed) {
            open.push({ tag: parsed.tag, mark });
            return;
          }
        } else {
          const idx = open.findLastIndex((o) => o.tag === parsed.tag);
          if (idx >= 0) {
            open.splice(idx, 1);
            return;
          }
        }
      }
      out.push(...rawInline('html', child.value, current()));
      return;
    }
    out.push(...convertPhrasing(child, current(), ctx));
  });
  return out;
}

function convertPhrasing(node: md.PhrasingContent, marks: readonly Mark[], ctx: Ctx): PMNode[] {
  switch (node.type) {
    case 'text':
      return textWithHighlights(node.value, marks);
    case 'strong':
      return convertInline(node.children, schema.marks.strong.create().addToSet(marks), ctx);
    case 'emphasis':
      return convertInline(node.children, schema.marks.em.create().addToSet(marks), ctx);
    case 'delete':
      return convertInline(node.children, schema.marks.strike.create().addToSet(marks), ctx);
    case 'inlineCode':
      return textNode(node.value, schema.marks.code.create().addToSet(marks));
    case 'link':
      return convertInline(
        node.children,
        schema.marks.link.create({ href: node.url, title: node.title ?? null }).addToSet(marks),
        ctx,
      );
    case 'image':
      return [
        schema.nodes.image.create(
          { src: node.url, alt: node.alt ?? '', title: node.title ?? null },
          null,
          marks,
        ),
      ];
    case 'break':
      return [schema.nodes.hard_break.create(null, null, marks)];
    case 'inlineMath':
      return rawInline('math', sourceOf(node, ctx) || `$${node.value}$`, marks);
    case 'html':
      return rawInline('html', node.value, marks);
    case 'footnoteReference':
      return rawInline('footnote', sourceOf(node, ctx), marks);
    default:
      // linkReference, imageReference, … : kept verbatim.
      return rawInline('markdown', sourceOf(node, ctx), marks);
  }
}

// ---------- blocks ----------

const ALERT_MARKER = /^\[!([a-z]+)\][ \t]*(?:\n|$)/i;

/**
 * Detects a GitHub alert (`> [!NOTE]` on the first line of a quote) and removes the marker from the
 * mdast node, so the editor shows only the content. The serializer writes the marker back.
 */
function stripAlertMarker(quote: md.Blockquote): AlertType | null {
  const first = quote.children[0];
  if (first?.type !== 'paragraph') return null;
  const text = first.children[0];
  if (text?.type !== 'text') return null;
  const m = ALERT_MARKER.exec(text.value);
  const type = m?.[1]?.toLowerCase() as AlertType | undefined;
  if (!m || !type || !ALERT_TYPES.includes(type)) return null;
  text.value = text.value.slice(m[0].length);
  if (!text.value) first.children.shift();
  if (!first.children.length) quote.children.shift();
  return type;
}

function convertBlocks(children: readonly md.RootContent[], ctx: Ctx): PMNode[] {
  return children.flatMap((child) => convertBlock(child, ctx));
}

function ensureBlocks(nodes: PMNode[]): PMNode[] {
  return nodes.length ? nodes : [schema.nodes.paragraph.create()];
}

function convertList(node: md.List, ctx: Ctx): PMNode {
  const tight = !node.spread && node.children.every((item) => !item.spread);
  const items = node.children.map((item) =>
    schema.nodes.list_item.create(
      { checked: item.checked ?? null },
      ensureBlocks(convertBlocks(item.children, ctx)),
    ),
  );
  return node.ordered
    ? schema.nodes.ordered_list.create({ order: node.start ?? 1, tight }, items)
    : schema.nodes.bullet_list.create({ tight }, items);
}

function convertTable(node: md.Table, ctx: Ctx): PMNode {
  const rows = node.children.map((row, rowIndex) =>
    schema.nodes.table_row.create(
      null,
      row.children.map((cell, col) => {
        const type = rowIndex === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
        const align = (node.align?.[col] ?? null) as CellAlign;
        return type.create({ align }, convertInline(cell.children, [], ctx));
      }),
    ),
  );
  return schema.nodes.table.create(null, rows);
}

function convertBlock(node: md.RootContent, ctx: Ctx): PMNode[] {
  switch (node.type) {
    case 'paragraph': {
      const only = node.children.length === 1 ? node.children[0] : null;
      if (only?.type === 'text' && /^\[toc\]$/i.test(only.value.trim())) {
        return [schema.nodes.toc.create({ text: only.value.trim() })];
      }
      return [schema.nodes.paragraph.create(null, convertInline(node.children, [], ctx))];
    }
    case 'heading':
      return [schema.nodes.heading.create({ level: node.depth }, convertInline(node.children, [], ctx))];
    case 'thematicBreak':
      return [schema.nodes.horizontal_rule.create()];
    case 'blockquote': {
      const alert = stripAlertMarker(node);
      return [schema.nodes.blockquote.create({ alert }, ensureBlocks(convertBlocks(node.children, ctx)))];
    }
    case 'list':
      return [convertList(node, ctx)];
    case 'code':
      return [
        schema.nodes.code_block.create(
          { language: node.lang ?? '', meta: node.meta ?? '' },
          node.value ? schema.text(node.value) : null,
        ),
      ];
    case 'table':
      return [convertTable(node, ctx)];
    case 'html':
      return [rawBlock('html', node.value)];
    case 'yaml':
      return [rawBlock('frontmatter', node.value)];
    case 'math':
      return [rawBlock('math', sourceOf(node, ctx))];
    case 'footnoteDefinition':
      return [rawBlock('footnote', sourceOf(node, ctx))];
    default:
      // definition, … : kept verbatim.
      return [rawBlock('markdown', sourceOf(node, ctx))];
  }
}

/** Parses markdown into a ProseMirror document. The input must use `\n` line endings. */
export function parseMarkdown(markdown: string): PMNode {
  const root = parseMdast(markdown);
  const ctx: Ctx = { source: markdown };
  return schema.nodes.doc.create(null, ensureBlocks(convertBlocks(root.children, ctx)));
}

/** 0-based source line where each top-level block starts (used to sync scrolling in split view). */
export function topLevelLines(markdown: string): number[] {
  return parseMdast(markdown).children.map((child) => (child.position?.start.line ?? 1) - 1);
}
