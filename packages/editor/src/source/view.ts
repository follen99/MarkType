import { EditorState, EditorSelection, type ChangeSpec } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, type ViewUpdate } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
  selectLine as cmSelectLine,
  selectParentSyntax,
  deleteGroupBackward,
} from '@codemirror/commands';
import { syntaxHighlighting, indentUnit } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { tagHighlighter, tags } from '@lezer/highlight';
import { search, highlightSelectionMatches } from '@codemirror/search';
import type { EditorCommandId } from '../commands.ts';

/** Token classes named like CodeMirror 5's markdown mode, so Typora themes style source mode too. */
const typoraHighlighter = tagHighlighter([
  { tag: tags.heading, class: 'cm-header' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.emphasis, class: 'cm-em' },
  { tag: tags.strikethrough, class: 'cm-strikethrough' },
  { tag: tags.link, class: 'cm-link' },
  { tag: tags.url, class: 'cm-url' },
  { tag: tags.monospace, class: 'cm-comment' },
  { tag: tags.quote, class: 'cm-quote' },
  { tag: tags.list, class: 'cm-variable-2' },
  { tag: tags.processingInstruction, class: 'cm-formatting' },
  { tag: tags.contentSeparator, class: 'cm-hr' },
  { tag: tags.meta, class: 'cm-meta' },
  { tag: tags.comment, class: 'cm-comment' },
]);

export interface SourceViewOptions {
  onUpdate?(update: ViewUpdate): void;
  prompt(kind: 'link' | 'image', initial: string): Promise<string | null>;
}

export function createSourceView(parent: HTMLElement, text: string, options: SourceViewOptions): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        history(),
        search(),
        highlightSelectionMatches(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        indentUnit.of('    '),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(typoraHighlighter),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ spellcheck: 'false' }),
        EditorView.updateListener.of((update) => options.onUpdate?.(update)),
      ],
    }),
  });
}

// ---------- commands on markdown text ----------

function wrapSelection(view: EditorView, before: string, after = before): boolean {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => {
      const text = state.sliceDoc(range.from, range.to);
      const outerFrom = range.from - before.length;
      const outerTo = range.to + after.length;
      // Toggle off if the selection is already wrapped.
      if (
        outerFrom >= 0 &&
        state.sliceDoc(outerFrom, range.from) === before &&
        state.sliceDoc(range.to, outerTo) === after
      ) {
        return {
          changes: [
            { from: outerFrom, to: range.from },
            { from: range.to, to: outerTo },
          ],
          range: EditorSelection.range(outerFrom, range.to - before.length),
        };
      }
      return {
        changes: { from: range.from, to: range.to, insert: before + text + after },
        range: EditorSelection.range(range.from + before.length, range.to + before.length),
      };
    }),
  );
  return true;
}

/** Applies `transform` to the start of every selected line (headings, quotes, lists). */
function editLinePrefixes(view: EditorView, transform: (line: string, index: number) => string): boolean {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  let index = 0;
  for (const range of state.selection.ranges) {
    for (let pos = range.from; pos <= range.to;) {
      const line = state.doc.lineAt(pos);
      if (!seen.has(line.number)) {
        seen.add(line.number);
        const next = transform(line.text, index++);
        if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
      }
      pos = line.to + 1;
    }
  }
  view.dispatch({ changes });
  return true;
}

const HEADING = /^#{1,6}\s+/;
const LIST = /^(\s*)([-+*]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

function setHeading(level: number) {
  return (line: string) => {
    const bare = line.replace(HEADING, '');
    const current = HEADING.exec(line)?.[0].trim().length ?? 0;
    return current === level || level === 0 ? bare : `${'#'.repeat(level)} ${bare}`;
  };
}

function toggleLinePrefix(prefix: (index: number) => string, pattern: RegExp) {
  return (line: string, index: number) =>
    pattern.test(line) ? line.replace(pattern, '$1') : prefix(index) + line;
}

async function insertLink(view: EditorView, options: SourceViewOptions, image: boolean): Promise<void> {
  const range = view.state.selection.main;
  const text = view.state.sliceDoc(range.from, range.to);
  const url = await options.prompt(image ? 'image' : 'link', '');
  if (url === null) return view.focus();
  const insert = `${image ? '!' : ''}[${text}](${url})`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from + (image ? 2 : 1), head: range.from + (image ? 2 : 1) + text.length },
  });
  view.focus();
}

function insertBlock(view: EditorView, block: string, cursorOffset: number): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const before = line.length ? `${line.text}\n\n` : '';
  const insert = `${before}${block}\n`;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: { anchor: line.from + before.length + cursorOffset },
  });
  return true;
}

export function runSourceCommand(view: EditorView, id: EditorCommandId, options: SourceViewOptions): boolean {
  switch (id) {
    case 'undo':
      return undo(view);
    case 'redo':
      return redo(view);
    case 'selectAll':
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      return true;
    case 'bold':
      return wrapSelection(view, '**');
    case 'italic':
      return wrapSelection(view, '*');
    case 'underline':
      return wrapSelection(view, '<u>', '</u>');
    case 'inlineCode':
      return wrapSelection(view, '`');
    case 'strike':
      return wrapSelection(view, '~~');
    case 'highlight':
      return wrapSelection(view, '==');
    case 'link':
      void insertLink(view, options, false);
      return true;
    case 'image':
      void insertLink(view, options, true);
      return true;
    case 'paragraph':
      return editLinePrefixes(view, setHeading(0));
    case 'heading1':
    case 'heading2':
    case 'heading3':
    case 'heading4':
    case 'heading5':
    case 'heading6':
      return editLinePrefixes(view, setHeading(Number(id.slice(-1))));
    case 'quote':
      return editLinePrefixes(
        view,
        toggleLinePrefix(() => '> ', /^(\s*)>\s?/),
      );
    case 'bulletList':
      return editLinePrefixes(
        view,
        toggleLinePrefix(() => '- ', LIST),
      );
    case 'orderedList':
      return editLinePrefixes(
        view,
        toggleLinePrefix((i) => `${i + 1}. `, LIST),
      );
    case 'taskList':
      return editLinePrefixes(
        view,
        toggleLinePrefix(() => '- [ ] ', LIST),
      );
    case 'codeBlock':
      return insertBlock(view, '```\n\n```', 4);
    case 'mathBlock':
      return insertBlock(view, '$$\n\n$$', 3);
    case 'horizontalRule':
      return insertBlock(view, '---\n', 4);
    case 'table':
      return insertBlock(view, '|  |  |  |\n| --- | --- | --- |\n|  |  |  |', 2);
    case 'selectLine':
      return cmSelectLine(view);
    case 'selectScope':
      return selectParentSyntax(view);
    case 'deleteWord':
      return deleteGroupBackward(view);
    default:
      return false;
  }
}
