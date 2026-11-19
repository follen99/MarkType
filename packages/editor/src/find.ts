import {
  SearchQuery as PMQuery,
  findNext as pmFindNext,
  findPrev as pmFindPrev,
  getMatchHighlights,
  replaceAll as pmReplaceAll,
  replaceNext as pmReplaceNext,
  setSearchState,
} from 'prosemirror-search';
import { TextSelection } from 'prosemirror-state';
import type { EditorView as PMView } from 'prosemirror-view';
import {
  SearchQuery as CMQuery,
  findNext as cmFindNext,
  findPrevious as cmFindPrev,
  replaceAll as cmReplaceAll,
  replaceNext as cmReplaceNext,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorView as CMView } from '@codemirror/view';

export interface FindQuery {
  text: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface FindResult {
  /** Number of matches (capped at MAX_COUNT). */
  count: number;
  /** 1-based index of the selected match, 0 if the selection is not on a match. */
  current: number;
  /** False for an invalid regular expression. */
  valid: boolean;
}

export type FindAction = 'next' | 'prev' | 'replace' | 'replaceAll';

const MAX_COUNT = 9999;
const EMPTY: FindResult = { count: 0, current: 0, valid: true };

// ---------- WYSIWYG (ProseMirror) ----------

function pmQuery(q: FindQuery): PMQuery {
  return new PMQuery({
    search: q.text,
    replace: q.replace,
    caseSensitive: q.caseSensitive,
    wholeWord: q.wholeWord,
    regexp: q.regex,
    literal: !q.regex,
  });
}

function pmResult(view: PMView, valid: boolean): FindResult {
  if (!valid) return { count: 0, current: 0, valid: false };
  const { from, to } = view.state.selection;
  // A match spanning several text nodes yields several decorations: count distinct ranges.
  const ranges = new Map<string, number>();
  for (const d of getMatchHighlights(view.state).find()) ranges.set(`${d.from}-${d.to}`, d.from);
  const sorted = [...ranges.keys()].sort((a, b) => ranges.get(a)! - ranges.get(b)!);
  const current = sorted.indexOf(`${from}-${to}`) + 1;
  return { count: Math.min(sorted.length, MAX_COUNT), current, valid: true };
}

export function pmSetFind(view: PMView, q: FindQuery | null, jump: boolean): FindResult {
  const query = pmQuery(q ?? { text: '', replace: '', caseSensitive: false, wholeWord: false, regex: false });
  view.dispatch(setSearchState(view.state.tr, query));
  if (!q?.text) return EMPTY;
  if (!query.valid) return pmResult(view, false);
  if (jump) {
    // Incremental search: select the first match from the start of the current selection.
    const { from } = view.state.selection;
    const result = query.findNext(view.state, from) ?? query.findNext(view.state, 0);
    if (result) {
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, result.from, result.to))
          .scrollIntoView(),
      );
    }
  }
  return pmResult(view, true);
}

export function pmFind(view: PMView, action: FindAction): FindResult {
  const command = { next: pmFindNext, prev: pmFindPrev, replace: pmReplaceNext, replaceAll: pmReplaceAll }[
    action
  ];
  command(view.state, view.dispatch);
  return pmResult(view, true);
}

// ---------- Source (CodeMirror) ----------

function cmQuery(q: FindQuery): CMQuery {
  return new CMQuery({
    search: q.text,
    replace: q.replace,
    caseSensitive: q.caseSensitive,
    wholeWord: q.wholeWord,
    regexp: q.regex,
    literal: !q.regex,
  });
}

function cmResult(view: CMView, query: CMQuery): FindResult {
  if (!query.search) return EMPTY;
  if (!query.valid) return { count: 0, current: 0, valid: false };
  const main = view.state.selection.main;
  let count = 0;
  let current = 0;
  const cursor = query.getCursor(view.state);
  for (let next = cursor.next(); !next.done && count < MAX_COUNT; next = cursor.next()) {
    count++;
    if (next.value.from === main.from && next.value.to === main.to) current = count;
  }
  return { count, current, valid: true };
}

const cmQueries = new WeakMap<CMView, CMQuery>();

export function cmSetFind(view: CMView, q: FindQuery | null, jump: boolean): FindResult {
  const query = cmQuery(q ?? { text: '', replace: '', caseSensitive: false, wholeWord: false, regex: false });
  cmQueries.set(view, query);
  view.dispatch({ effects: setSearchQuery.of(query) });
  if (q?.text && query.valid && jump) {
    const from = view.state.selection.main.from;
    const cursor = query.getCursor(view.state, from);
    let next = cursor.next();
    if (next.done) next = query.getCursor(view.state).next();
    if (!next.done) {
      view.dispatch({ selection: { anchor: next.value.from, head: next.value.to }, scrollIntoView: true });
    }
  }
  return cmResult(view, query);
}

export function cmFind(view: CMView, action: FindAction): FindResult {
  const command = { next: cmFindNext, prev: cmFindPrev, replace: cmReplaceNext, replaceAll: cmReplaceAll }[
    action
  ];
  command(view);
  return cmResult(
    view,
    cmQueries.get(view) ??
      cmQuery({ text: '', replace: '', caseSensitive: false, wholeWord: false, regex: false }),
  );
}
