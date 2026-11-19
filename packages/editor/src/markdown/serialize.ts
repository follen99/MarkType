import type { Mark, Node as PMNode } from 'prosemirror-model';
import type * as md from 'mdast';
import { defaultMarkdownStyle, stringifyMdast, type MarkdownStyle } from './processor.ts';

type Parent = { children: md.PhrasingContent[] };

/** Wraps phrasing content for a mark. Returns the new parent whose children receive the content. */
function openMark(mark: Mark, parent: Parent): Parent {
  let node: md.PhrasingContent & Parent;
  switch (mark.type.name) {
    case 'link':
      node = {
        type: 'link',
        url: mark.attrs.href as string,
        title: (mark.attrs.title as string) ?? null,
        children: [],
      };
      break;
    case 'strong':
      node = { type: 'strong', children: [] };
      break;
    case 'em':
      node = { type: 'emphasis', children: [] };
      break;
    case 'strike':
      node = { type: 'delete', children: [] };
      break;
    case 'underline': {
      // No markdown syntax: written as <u>…</u>. Children go between the two html nodes.
      const group: Parent = { children: [] };
      parent.children.push({ type: 'html', value: '<u>' });
      (group as Parent & { close: () => void }).close = () => {
        parent.children.push(...group.children, { type: 'html', value: '</u>' });
      };
      return group;
    }
    default:
      throw new Error(`unexpected mark ${mark.type.name}`);
  }
  parent.children.push(node);
  return node;
}

function closeMark(parent: Parent): void {
  (parent as Parent & { close?: () => void }).close?.();
}

/** Literal marks: their text becomes a leaf node instead of nested phrasing. */
function isLiteralMark(mark: Mark): boolean {
  return mark.type.name === 'code' || mark.type.name === 'raw';
}

function inlineContent(block: PMNode): md.PhrasingContent[] {
  const root: Parent = { children: [] };
  const stack: { mark: Mark; parent: Parent }[] = [];
  const top = (): Parent => stack.at(-1)?.parent ?? root;
  let literal: { mark: Mark; text: string } | null = null;

  const flushLiteral = () => {
    if (!literal) return;
    top().children.push(
      literal.mark.type.name === 'code'
        ? { type: 'inlineCode', value: literal.text }
        : { type: 'html', value: literal.text },
    );
    literal = null;
  };

  block.forEach((child) => {
    const structural = child.marks.filter((m) => !isLiteralMark(m));
    const lit = child.marks.find(isLiteralMark) ?? null;

    // Keep the longest prefix of open marks that the child still has.
    let keep = 0;
    while (keep < stack.length && keep < structural.length && stack[keep]!.mark.eq(structural[keep]!)) keep++;
    if (keep < stack.length || (literal && !(lit && literal.mark.eq(lit)))) flushLiteral();
    while (stack.length > keep) closeMark(stack.pop()!.parent);
    for (const mark of structural.slice(keep)) stack.push({ mark, parent: openMark(mark, top()) });

    if (child.isText) {
      if (lit) {
        if (literal && literal.mark.eq(lit)) literal.text += child.text!;
        else {
          flushLiteral();
          literal = { mark: lit, text: child.text! };
        }
      } else {
        flushLiteral();
        top().children.push({ type: 'text', value: child.text! });
      }
    } else {
      flushLiteral();
      if (child.type.name === 'image') {
        top().children.push({
          type: 'image',
          url: child.attrs.src as string,
          alt: (child.attrs.alt as string) || null,
          title: (child.attrs.title as string) ?? null,
        });
      } else if (child.type.name === 'hard_break') {
        top().children.push({ type: 'break' });
      }
    }
  });
  flushLiteral();
  while (stack.length) closeMark(stack.pop()!.parent);
  return root.children;
}

function blockContent(node: PMNode): md.RootContent[] {
  const out: md.RootContent[] = [];
  node.forEach((child) => {
    const converted = convertBlock(child);
    if (converted) out.push(converted);
  });
  return out;
}

function listItems(list: PMNode, tight: boolean): md.ListItem[] {
  const items: md.ListItem[] = [];
  list.forEach((item) => {
    items.push({
      type: 'listItem',
      spread: !tight,
      checked: item.attrs.checked as boolean | null,
      children: blockContent(item) as md.BlockContent[],
    });
  });
  return items;
}

function convertBlock(node: PMNode): md.RootContent | null {
  switch (node.type.name) {
    case 'paragraph': {
      const children = inlineContent(node);
      return children.length ? { type: 'paragraph', children } : null;
    }
    case 'heading':
      return {
        type: 'heading',
        depth: node.attrs.level as md.Heading['depth'],
        children: inlineContent(node),
      };
    case 'blockquote': {
      const children = blockContent(node) as md.BlockContent[];
      const alert = node.attrs.alert as string | null;
      if (alert) {
        // Written as html so it is not escaped to `\[!NOTE]`.
        const marker: md.Html = { type: 'html', value: `[!${alert.toUpperCase()}]` };
        const first = children[0];
        if (first?.type === 'paragraph') first.children.unshift(marker, { type: 'text', value: '\n' });
        else children.unshift({ type: 'paragraph', children: [marker] });
      }
      return { type: 'blockquote', children };
    }
    case 'code_block':
      return {
        type: 'code',
        lang: (node.attrs.language as string) || null,
        meta: (node.attrs.meta as string) || null,
        value: node.textContent,
      };
    case 'raw_block':
      return node.attrs.kind === 'frontmatter'
        ? { type: 'yaml', value: node.textContent }
        : { type: 'html', value: node.textContent };
    case 'horizontal_rule':
      return { type: 'thematicBreak' };
    case 'bullet_list':
    case 'ordered_list': {
      const tight = node.attrs.tight as boolean;
      const ordered = node.type.name === 'ordered_list';
      return {
        type: 'list',
        ordered,
        start: ordered ? (node.attrs.order as number) : null,
        spread: !tight,
        children: listItems(node, tight),
      };
    }
    case 'table': {
      const align: md.AlignType[] = [];
      const rows: md.TableRow[] = [];
      node.forEach((row, _offset, rowIndex) => {
        const cells: md.TableCell[] = [];
        row.forEach((cell) => {
          if (rowIndex === 0) align.push((cell.attrs.align as md.AlignType) ?? null);
          cells.push({ type: 'tableCell', children: inlineContent(cell) });
        });
        rows.push({ type: 'tableRow', children: cells });
      });
      return { type: 'table', align, children: rows };
    }
    default:
      return null;
  }
}

/** Serializes a ProseMirror document to markdown (`\n` line endings, trailing newline). */
export function serializeMarkdown(doc: PMNode, style: MarkdownStyle = defaultMarkdownStyle): string {
  const root: md.Root = { type: 'root', children: blockContent(doc) };
  return stringifyMdast(root, style);
}
