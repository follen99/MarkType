import type { Language } from '@codemirror/language';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** Token classes of CodeMirror 5, which Typora themes style under `.cm-s-inner`. */
export const codeHighlighter = tagHighlighter([
  { tag: t.keyword, class: 'cm-keyword' },
  { tag: [t.atom, t.bool, t.null], class: 'cm-atom' },
  { tag: t.number, class: 'cm-number' },
  { tag: [t.string, t.attributeValue], class: 'cm-string' },
  { tag: [t.special(t.string), t.regexp, t.escape], class: 'cm-string-2' },
  { tag: t.comment, class: 'cm-comment' },
  { tag: t.variableName, class: 'cm-variable' },
  { tag: [t.definition(t.variableName), t.function(t.definition(t.variableName))], class: 'cm-def' },
  { tag: [t.local(t.variableName), t.labelName], class: 'cm-variable-2' },
  { tag: [t.typeName, t.className, t.namespace], class: 'cm-variable-3' },
  { tag: [t.propertyName, t.definition(t.propertyName)], class: 'cm-property' },
  { tag: t.operator, class: 'cm-operator' },
  { tag: [t.meta, t.annotation, t.processingInstruction, t.macroName], class: 'cm-meta' },
  { tag: t.tagName, class: 'cm-tag' },
  { tag: t.attributeName, class: 'cm-attribute' },
  { tag: t.heading, class: 'cm-header' },
  { tag: [t.link, t.url], class: 'cm-link' },
  { tag: [t.self, t.standard(t.variableName), t.special(t.variableName)], class: 'cm-builtin' },
  { tag: t.invalid, class: 'cm-error' },
  { tag: t.strong, class: 'cm-strong' },
  { tag: t.emphasis, class: 'cm-em' },
]);

const loaded = new Map<string, Language>();
const pending = new Set<string>();
const missing = new Set<string>();

type LanguageList = typeof import('./languages.ts');
let list: LanguageList | null = null;
let listLoading: Promise<LanguageList> | null = null;
const waiting = new Set<() => void>();

/** Loads the language list once; every caller gets `onLoad` (deduplicated) when it is there. */
function loadList(onLoad: () => void): void {
  waiting.add(onLoad);
  listLoading ??= import('./languages.ts').then((module) => {
    list = module;
    for (const cb of waiting) cb();
    waiting.clear();
    return module;
  });
}

/**
 * The parser for a fence language (`js`, `python`…). Returns null while it is still loading (each
 * language is a separate chunk, loaded the first time it is used) and calls `onLoad` when ready.
 */
export function languageFor(name: string, onLoad: () => void): Language | null {
  const key = name.trim().toLowerCase();
  if (!key || missing.has(key)) return null;
  const ready = loaded.get(key);
  if (ready) return ready;
  if (!list) {
    loadList(onLoad);
    return null;
  }
  const description = list.LanguageDescription.matchLanguageName(list.languages, key, true);
  if (!description) {
    missing.add(key);
    return null;
  }
  if (description.support) {
    loaded.set(key, description.support.language);
    return description.support.language;
  }
  if (!pending.has(key)) {
    pending.add(key);
    description
      .load()
      .then((support) => {
        loaded.set(key, support.language);
        onLoad();
      })
      .catch(() => missing.add(key))
      .finally(() => pending.delete(key));
  }
  return null;
}

interface Span {
  from: number;
  to: number;
  cls: string;
}

export function highlightCode(language: Language, code: string): Span[] {
  const spans: Span[] = [];
  const tree = language.parser.parse(code);
  highlightTree(tree, codeHighlighter, (from, to, cls) => spans.push({ from, to, cls }));
  return spans;
}

const spanCache = new WeakMap<PMNode, Span[]>();
const highlightKey = new PluginKey<DecorationSet>('mt-code-highlight');
const NO_HIGHLIGHT = new Set(['mermaid', 'math', 'text', 'plain', 'plaintext', 'txt']);

/** Decorations of one code block at `pos` (none until its language is loaded). */
function blockDecorations(node: PMNode, pos: number, onLoad: () => void): Decoration[] {
  const lang = (node.attrs.language as string).toLowerCase();
  if (!lang || NO_HIGHLIGHT.has(lang) || !node.textContent) return [];
  const language = languageFor(lang, onLoad);
  if (!language) return [];
  let spans = spanCache.get(node);
  if (!spans) {
    spans = highlightCode(language, node.textContent);
    spanCache.set(node, spans);
  }
  return spans.map((span) => Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.cls }));
}

/** Calls `f` for every code block between `from` and `to` (also inside lists and quotes). */
function eachCodeBlock(doc: PMNode, from: number, to: number, f: (node: PMNode, pos: number) => void) {
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'code_block') return node.isBlock && !node.isTextblock;
    f(node, pos);
    return false;
  });
}

function buildDecorations(doc: PMNode, onLoad: () => void): DecorationSet {
  const decorations: Decoration[] = [];
  eachCodeBlock(doc, 0, doc.content.size, (node, pos) =>
    decorations.push(...blockDecorations(node, pos, onLoad)),
  );
  return DecorationSet.create(doc, decorations);
}

/** Ranges of `tr.doc` touched by the transaction. */
function changedRanges(tr: Transaction): [number, number][] {
  const ranges: [number, number][] = [];
  tr.steps.forEach((step, index) => {
    const after = tr.mapping.slice(index + 1);
    step.getMap().forEach((_oldStart, _oldEnd, start, end) => {
      ranges.push([after.map(start, -1), after.map(end, 1)]);
    });
  });
  return ranges;
}

/**
 * After an edit only the code blocks the edit touched are highlighted again; the others keep their
 * (mapped) decorations. Rebuilding everything made typing slow in long documents (10k lines: ~17 ms per
 * key with 1000 code blocks).
 */
function updateDecorations(tr: Transaction, set: DecorationSet, onLoad: () => void): DecorationSet {
  let next = set.map(tr.mapping, tr.doc);
  const size = tr.doc.content.size;
  for (const [start, end] of changedRanges(tr)) {
    eachCodeBlock(tr.doc, Math.max(0, start - 1), Math.min(size, end + 1), (node, pos) => {
      next = next.remove(next.find(pos, pos + node.nodeSize));
      next = next.add(tr.doc, blockDecorations(node, pos, onLoad));
    });
  }
  return next;
}

/** Syntax highlighting of fenced code blocks, as decorations (no nested editor). */
export function codeHighlightPlugin(): Plugin<DecorationSet> {
  let refresh = () => {};
  return new Plugin<DecorationSet>({
    key: highlightKey,
    state: {
      init: (_config, state) => buildDecorations(state.doc, () => refresh()),
      apply: (tr, value, _old, state) => {
        // A language finished loading: highlight everything again.
        if (tr.getMeta(highlightKey)) return buildDecorations(state.doc, () => refresh());
        return tr.docChanged ? updateDecorations(tr, value, () => refresh()) : value;
      },
    },
    view(view) {
      refresh = () => {
        if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(highlightKey, true));
      };
      return {};
    },
    props: {
      decorations: (state) => highlightKey.getState(state),
    },
  });
}
