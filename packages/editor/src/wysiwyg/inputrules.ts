import { InputRule, inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import type { MarkType, Schema } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';

/**
 * Typing markdown syntax turns it into formatting (Typora behavior). Regexes avoid lookbehind so they
 * also run on older WebKit; group 1 is the prefix before the opening delimiter, group 2 the content.
 */

function rangeHasLiteral(state: EditorState, from: number, to: number): boolean {
  const { code, raw } = state.schema.marks;
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText && (code!.isInSet(node.marks) || raw!.isInSet(node.marks))) found = true;
  });
  return found;
}

function markRule(pattern: RegExp, type: MarkType, delimiter: number): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const prefix = match[1] ?? '';
    const content = match[2] ?? '';
    const openFrom = start + prefix.length;
    const contentFrom = openFrom + delimiter;
    const contentTo = contentFrom + content.length;
    if (rangeHasLiteral(state, openFrom, end)) return null;
    // The closing delimiter is partly in the document (all but the typed character).
    const tr = state.tr.delete(contentTo, end).delete(openFrom, contentFrom);
    tr.addMark(openFrom, openFrom + content.length, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

function linkRule(schema: Schema): InputRule {
  return new InputRule(
    /(^|[^!\\])\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/,
    (state, match, start, end) => {
      const prefix = match[1] ?? '';
      const text = match[2] ?? '';
      const from = start + prefix.length;
      if (rangeHasLiteral(state, from, end)) return null;
      const mark = schema.marks.link!.create({ href: match[3], title: match[4] ?? null });
      const tr = state.tr.replaceWith(from, end, schema.text(text, [mark]));
      tr.removeStoredMark(schema.marks.link!);
      return tr;
    },
  );
}

function imageRule(schema: Schema): InputRule {
  return new InputRule(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/, (state, match, start, end) => {
    if (rangeHasLiteral(state, start, end)) return null;
    const image = schema.nodes.image!.create({ alt: match[1] ?? '', src: match[2], title: match[3] ?? null });
    return state.tr.replaceWith(start, end, image);
  });
}

/** `[ ] ` or `[x] ` at the start of a list item turns it into a task. */
function taskRule(schema: Schema): InputRule {
  return new InputRule(/^\[([ xX])\]\s$/, (state, match, start, end) => {
    const $start = state.doc.resolve(start);
    const depth = $start.depth - 1;
    if (depth < 1 || $start.index(depth) !== 0) return null;
    const item = $start.node(depth);
    if (item.type !== schema.nodes.list_item || item.attrs.checked !== null) return null;
    return state.tr
      .delete(start, end)
      .setNodeMarkup($start.before(depth), null, { ...item.attrs, checked: match[1] !== ' ' });
  });
}

export function buildInputRules(schema: Schema) {
  const { nodes, marks } = schema;
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading!, (m) => ({ level: m[1]!.length })),
      wrappingInputRule(/^\s*>\s$/, nodes.blockquote!),
      wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list!),
      wrappingInputRule(
        /^(\d+)[.)]\s$/,
        nodes.ordered_list!,
        (m) => ({ order: Number(m[1]) }),
        (m, node) => node.childCount + (node.attrs.order as number) === Number(m[1]),
      ),
      taskRule(schema),
      markRule(/(^|[^*\\])\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/, marks.strong!, 2),
      markRule(/(^|[^_\w\\])__([^_\s](?:[^_]*[^_\s])?)__$/, marks.strong!, 2),
      markRule(/(^|[^*\\])\*([^*\s](?:[^*]*[^*\s])?)\*$/, marks.em!, 1),
      markRule(/(^|[^_\w\\])_([^_\s](?:[^_]*[^_\s])?)_$/, marks.em!, 1),
      markRule(/(^|[^~\\])~~([^~\s](?:[^~]*[^~\s])?)~~$/, marks.strike!, 2),
      markRule(/(^|[^`\\])`([^`]+)`$/, marks.code!, 1),
      imageRule(schema),
      linkRule(schema),
    ],
  });
}
