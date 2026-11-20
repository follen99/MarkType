import {
  SearchQuery as CMQuery,
  findNext as cmFindNext,
  findPrevious as cmFindPrev,
  replaceAll as cmReplaceAll,
  replaceNext as cmReplaceNext,
  setSearchQuery,
} from '@codemirror/search';
import type { EditorView as CMView } from '@codemirror/view';
import { EMPTY, MAX_COUNT, type FindAction, type FindQuery, type FindResult } from '../find.ts';

/** Find & replace in source mode (CodeMirror). Loaded with the source editor. */

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
