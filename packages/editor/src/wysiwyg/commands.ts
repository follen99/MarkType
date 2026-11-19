import {
  chainCommands,
  exitCode,
  lift,
  selectAll,
  setBlockType,
  toggleMark,
  wrapIn,
} from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import type { Attrs, Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { Selection, TextSelection, type Command, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { EditorCommandId } from '../commands.ts';
import { markRunAt } from './marks.ts';

export interface WysiwygCommandEnv {
  prompt(kind: 'link' | 'image', initial: string): Promise<string | null>;
}

// ---------- helpers ----------

function findAncestor(state: EditorState, predicate: (node: PMNode) => boolean) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (predicate(node)) return { node, depth, pos: $from.before(depth) };
  }
  return null;
}

function isList(schema: Schema, node: PMNode): boolean {
  return node.type === schema.nodes.bullet_list || node.type === schema.nodes.ordered_list;
}

/** Toggles a list type: lift if already in it, convert if in another list, wrap otherwise. */
function toggleList(type: NodeType, task: boolean): Command {
  return (state, dispatch) => {
    const { schema } = state;
    const list = findAncestor(state, (n) => isList(schema, n));
    if (list) {
      const isTask = list.node.firstChild?.attrs.checked !== null;
      if (list.node.type === type && isTask === task)
        return liftListItem(schema.nodes.list_item!)(state, dispatch);
      if (dispatch) {
        const tr = state.tr.setNodeMarkup(list.pos, type, list.node.type === type ? list.node.attrs : null);
        list.node.forEach((item, offset) => {
          tr.setNodeMarkup(list.pos + 1 + offset, null, {
            ...item.attrs,
            checked: task ? (item.attrs.checked ?? false) : null,
          });
        });
        dispatch(tr.scrollIntoView());
      }
      return true;
    }
    return wrapInList(type)(state, (tr) => {
      if (task) {
        const $pos = tr.doc.resolve(tr.mapping.map(state.selection.from));
        for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d);
          if (node.type === schema.nodes.bullet_list) {
            node.forEach((item, offset) => {
              tr.setNodeMarkup($pos.before(d) + 1 + offset, null, { ...item.attrs, checked: false });
            });
            break;
          }
        }
      }
      dispatch?.(tr.scrollIntoView());
    });
  };
}

function toggleBlock(type: NodeType, attrs: Attrs | null = null): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const paragraph = state.schema.nodes.paragraph!;
    const same =
      $from.parent.type === type &&
      (!attrs || Object.entries(attrs).every(([k, v]) => $from.parent.attrs[k] === v));
    return same ? setBlockType(paragraph)(state, dispatch) : setBlockType(type, attrs)(state, dispatch);
  };
}

function changeHeadingLevel(delta: -1 | 1): Command {
  return (state, dispatch) => {
    const { heading, paragraph } = state.schema.nodes;
    const parent = state.selection.$from.parent;
    if (parent.type === heading) {
      const level = (parent.attrs.level as number) + delta;
      if (level < 1) return false;
      return level > 6
        ? setBlockType(paragraph!)(state, dispatch)
        : setBlockType(heading!, { level })(state, dispatch);
    }
    // "Increase heading level" (delta -1) on a paragraph makes it the smallest heading.
    if (parent.type === paragraph && delta === -1)
      return setBlockType(heading!, { level: 6 })(state, dispatch);
    return false;
  };
}

function toggleQuote(): Command {
  return (state, dispatch) =>
    findAncestor(state, (n) => n.type === state.schema.nodes.blockquote)
      ? lift(state, dispatch)
      : wrapIn(state.schema.nodes.blockquote!)(state, dispatch);
}

function insertBlockAfter(create: (schema: Schema) => PMNode, selectInside: boolean): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = create(state.schema);
    if (dispatch) {
      const emptyParagraph =
        $from.parent.type === state.schema.nodes.paragraph && $from.parent.content.size === 0;
      const tr = state.tr;
      let pos: number;
      if (emptyParagraph && $from.depth > 0) {
        pos = $from.before();
        tr.replaceWith(pos, $from.after(), node);
      } else {
        pos = $from.after(Math.max(1, $from.depth));
        tr.insert(pos, node);
      }
      const after = pos + node.nodeSize;
      if (!selectInside && (after >= tr.doc.content.size || !tr.doc.resolve(after).nodeAfter?.isTextblock)) {
        tr.insert(after, state.schema.nodes.paragraph!.create());
      }
      const target = selectInside ? pos + 1 : after + 1;
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(target, tr.doc.content.size))));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

function insertTable(rows = 3, cols = 3): Command {
  return insertBlockAfter((schema) => {
    const row = (header: boolean) =>
      schema.nodes.table_row!.create(
        null,
        Array.from({ length: cols }, () =>
          (header ? schema.nodes.table_header! : schema.nodes.table_cell!).create(),
        ),
      );
    return schema.nodes.table!.create(null, [
      row(true),
      ...Array.from({ length: rows - 1 }, () => row(false)),
    ]);
  }, true);
}

const clearFormat: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  if (dispatch) {
    const tr = state.tr;
    for (const type of Object.values(state.schema.marks)) tr.removeMark(from, to, type);
    dispatch(tr);
  }
  return true;
};

const WORD = /[\p{L}\p{N}_]/u;

function wordRange(state: EditorState): { from: number; to: number } | null {
  const { $head } = state.selection;
  if (!$head.parent.isTextblock) return null;
  const text = $head.parent.textBetween(0, $head.parent.content.size, undefined, '￼');
  let start = $head.parentOffset;
  let end = start;
  while (start > 0 && WORD.test(text[start - 1]!)) start--;
  while (end < text.length && WORD.test(text[end]!)) end++;
  if (start === end) return null;
  const base = $head.start();
  return { from: base + start, to: base + end };
}

const selectWord: Command = (state, dispatch) => {
  const range = wordRange(state);
  if (!range) return false;
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, range.from, range.to)));
  return true;
};

const deleteWord: Command = (state, dispatch) => {
  const range = wordRange(state);
  if (!range) return false;
  dispatch?.(state.tr.delete(range.from, range.to));
  return true;
};

const selectLine: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if (!$from.parent.isTextblock) return false;
  dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $from.start(), $from.end())));
  return true;
};

/** Selects the styled run around the cursor, then the block, then the parent block (Typora Ctrl+E). */
const selectScope: Command = (state, dispatch) => {
  const { selection, schema } = state;
  const { $from } = selection;
  for (const type of Object.values(schema.marks)) {
    const run = markRunAt($from, type);
    if (run && (run.from < selection.from || run.to > selection.to)) {
      dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, run.from, run.to)));
      return true;
    }
  }
  for (let depth = $from.depth; depth > 0; depth--) {
    const start = $from.start(depth);
    const end = $from.end(depth);
    if (start < selection.from || end > selection.to) {
      dispatch?.(
        state.tr.setSelection(TextSelection.between(state.doc.resolve(start), state.doc.resolve(end))),
      );
      return true;
    }
  }
  return selectAll(state, dispatch);
};

/** Ctrl+K: edit the link under the cursor, or link the selection / insert a new link. */
async function editLink(view: EditorView, env: WysiwygCommandEnv): Promise<void> {
  const { state } = view;
  const linkType = state.schema.marks.link!;
  const { from, to, empty, $from } = state.selection;
  const run = empty ? markRunAt($from, linkType) : null;
  const href = await env.prompt('link', run ? (run.mark.attrs.href as string) : '');
  if (href === null) return view.focus();
  const tr = view.state.tr;
  if (run) {
    if (href) tr.addMark(run.from, run.to, linkType.create({ ...run.mark.attrs, href }));
    else tr.removeMark(run.from, run.to, linkType);
  } else if (!empty) {
    if (href) tr.addMark(from, to, linkType.create({ href }));
  } else if (href) {
    tr.insert(from, state.schema.text(href, [linkType.create({ href })]));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

async function insertImage(view: EditorView, env: WysiwygCommandEnv): Promise<void> {
  const src = await env.prompt('image', '');
  if (src) {
    const { from, to } = view.state.selection;
    view.dispatch(
      view.state.tr.replaceWith(from, to, view.state.schema.nodes.image!.create({ src })).scrollIntoView(),
    );
  }
  view.focus();
}

/** Edits a link range (clicking the `](url)` marker). */
export async function editLinkAt(
  view: EditorView,
  env: WysiwygCommandEnv,
  from: number,
  to: number,
): Promise<void> {
  const linkType = view.state.schema.marks.link!;
  const $from = view.state.doc.resolve(from);
  const mark = linkType.isInSet($from.nodeAfter?.marks ?? []);
  const href = await env.prompt('link', (mark?.attrs.href as string) ?? '');
  if (href === null) return view.focus();
  const tr = view.state.tr;
  if (href) tr.addMark(from, to, linkType.create({ ...(mark?.attrs ?? {}), href }));
  else tr.removeMark(from, to, linkType);
  view.dispatch(tr);
  view.focus();
}

/** Runs an editor command. Returns false if it does not apply in the current context. */
export function runWysiwygCommand(view: EditorView, id: EditorCommandId, env: WysiwygCommandEnv): boolean {
  const { schema } = view.state;
  const { nodes, marks } = schema;
  const run = (cmd: Command) => cmd(view.state, view.dispatch, view);

  switch (id) {
    case 'undo':
      return run(undo);
    case 'redo':
      return run(redo);
    case 'selectAll':
      return run(selectAll);
    case 'bold':
      return run(toggleMark(marks.strong!));
    case 'italic':
      return run(toggleMark(marks.em!));
    case 'underline':
      return run(toggleMark(marks.underline!));
    case 'inlineCode':
      return run(toggleMark(marks.code!));
    case 'strike':
      return run(toggleMark(marks.strike!));
    case 'clearFormat':
      return run(clearFormat);
    case 'link':
      void editLink(view, env);
      return true;
    case 'image':
      void insertImage(view, env);
      return true;
    case 'paragraph':
      return run(setBlockType(nodes.paragraph!));
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5':
    case 'heading6':
      return run(toggleBlock(nodes.heading!, { level: Number(id.slice(-1)) }));
    case 'headingUp':
      return run(changeHeadingLevel(-1));
    case 'headingDown':
      return run(changeHeadingLevel(1));
    case 'quote':
      return run(toggleQuote());
    case 'bulletList':
      return run(toggleList(nodes.bullet_list!, false));
    case 'orderedList':
      return run(toggleList(nodes.ordered_list!, false));
    case 'taskList':
      return run(toggleList(nodes.bullet_list!, true));
    case 'codeBlock':
      return run(toggleBlock(nodes.code_block!));
    case 'mathBlock':
      return run(
        insertBlockAfter((s) => s.nodes.raw_block!.create({ kind: 'math' }, s.text('$$\n\n$$')), true),
      );
    case 'horizontalRule':
      return run(insertBlockAfter((s) => s.nodes.horizontal_rule!.create(), false));
    case 'table':
      return run(insertTable());
    case 'indent':
      return run(sinkListItem(nodes.list_item!));
    case 'outdent':
      return run(chainCommands(liftListItem(nodes.list_item!), lift));
    case 'exitBlock':
      return run(exitCode);
    case 'selectWord':
      return run(selectWord);
    case 'selectLine':
      return run(selectLine);
    case 'selectScope':
      return run(selectScope);
    case 'deleteWord':
      return run(deleteWord);
    default:
      return false;
  }
}
