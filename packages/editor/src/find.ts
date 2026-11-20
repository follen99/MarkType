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

export const MAX_COUNT = 9999;
export const EMPTY: FindResult = { count: 0, current: 0, valid: true };

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
