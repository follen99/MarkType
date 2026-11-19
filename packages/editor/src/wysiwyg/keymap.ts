import { baseKeymap, chainCommands, exitCode, setBlockType } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { undoInputRule } from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import type { Schema } from 'prosemirror-model';
import { Selection, TextSelection, type Command } from 'prosemirror-state';
import { goToNextCell } from 'prosemirror-tables';

/**
 * Enter on a paragraph containing only ```lang turns it into a code block; `---`, `***` or `___` into a
 * horizontal rule; `$$` into a math block (Typora behavior).
 */
function enterBlockSyntax(schema: Schema): Command {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (
      !empty ||
      $from.parent.type !== schema.nodes.paragraph ||
      $from.parentOffset !== $from.parent.content.size
    ) {
      return false;
    }
    const text = $from.parent.textContent;
    const start = $from.before();
    const end = $from.after();

    const fence = /^```([^\s`]*)\s*$/.exec(text) ?? /^~~~([^\s~]*)\s*$/.exec(text);
    if (fence) {
      if (dispatch) {
        const tr = state.tr.replaceWith(
          start,
          end,
          schema.nodes.code_block!.create({ language: fence[1] ?? '' }),
        );
        dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 1)).scrollIntoView());
      }
      return true;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(text)) {
      if (dispatch) {
        const tr = state.tr.replaceWith(start, end, [
          schema.nodes.horizontal_rule!.create(),
          schema.nodes.paragraph!.create(),
        ]);
        dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 2)).scrollIntoView());
      }
      return true;
    }
    if (text === '$$') {
      if (dispatch) {
        const tr = state.tr.replaceWith(
          start,
          end,
          schema.nodes.raw_block!.create({ kind: 'math' }, schema.text('$$\n\n$$')),
        );
        dispatch(tr.setSelection(TextSelection.create(tr.doc, start + 4)).scrollIntoView());
      }
      return true;
    }
    return false;
  };
}

/** Backspace at the start of a heading turns it back into a paragraph. */
function headingToParagraph(schema: Schema): Command {
  return (state, dispatch) => {
    const { $from, empty } = state.selection;
    if (!empty || $from.parentOffset !== 0 || $from.parent.type !== schema.nodes.heading) return false;
    return setBlockType(schema.nodes.paragraph!)(state, dispatch);
  };
}

/** Arrow down / right at the very end of a trailing non-paragraph block adds a paragraph to escape it. */
function escapeLastBlock(schema: Schema): Command {
  return (state, dispatch) => {
    const { $head, empty } = state.selection;
    if (!empty || !$head.parent.isTextblock || $head.parentOffset !== $head.parent.content.size) return false;
    // Only from the last textblock of the document, unless it already is a top-level paragraph.
    if (Selection.findFrom(state.doc.resolve($head.after()), 1, true)) return false;
    if ($head.depth === 1 && $head.parent.type === schema.nodes.paragraph) return false;
    if (dispatch) {
      const tr = state.tr.insert(state.doc.content.size, schema.nodes.paragraph!.create());
      dispatch(tr.setSelection(Selection.atEnd(tr.doc)).scrollIntoView());
    }
    return true;
  };
}

const insertTab: Command = (state, dispatch) => {
  if (!state.selection.$from.parent.type.spec.code) return false;
  dispatch?.(state.tr.insertText('    ').scrollIntoView());
  return true;
};

const hardBreak =
  (schema: Schema): Command =>
  (state, dispatch) => {
    if (state.selection.$from.parent.type.spec.code) {
      dispatch?.(state.tr.insertText('\n').scrollIntoView());
      return true;
    }
    dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
    return true;
  };

export function buildKeymaps(schema: Schema) {
  const item = schema.nodes.list_item!;
  return [
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      Enter: chainCommands(enterBlockSyntax(schema), splitListItem(item)),
      'Shift-Enter': hardBreak(schema),
      'Mod-Enter': exitCode,
      Backspace: chainCommands(undoInputRule, headingToParagraph(schema)),
      Tab: chainCommands(goToNextCell(1), sinkListItem(item), insertTab, () => true),
      'Shift-Tab': chainCommands(goToNextCell(-1), liftListItem(item), () => true),
      ArrowDown: escapeLastBlock(schema),
      ArrowRight: escapeLastBlock(schema),
    }),
    keymap(baseKeymap),
  ];
}
