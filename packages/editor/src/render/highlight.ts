import type { Language } from '@codemirror/language';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightTree, tagHighlighter, tags as t } from '@lezer/highlight';
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, PluginKey } from 'prosemirror-state';
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

/**
 * The parser for a fence language (`js`, `python`…). Returns null while it is still loading (each
 * language is a separate chunk, loaded the first time it is used) and calls `onLoad` when ready.
 */
export function languageFor(name: string, onLoad: () => void): Language | null {
  const key = name.trim().toLowerCase();
  if (!key || missing.has(key)) return null;
  const ready = loaded.get(key);
  if (ready) return ready;
  const description = LanguageDescription.matchLanguageName(languages, key, true);
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

function buildDecorations(doc: PMNode, onLoad: () => void): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return node.isBlock && !node.isTextblock;
    const lang = (node.attrs.language as string).toLowerCase();
    if (!lang || NO_HIGHLIGHT.has(lang) || !node.textContent) return false;
    const language = languageFor(lang, onLoad);
    if (!language) return false;
    let spans = spanCache.get(node);
    if (!spans) {
      spans = highlightCode(language, node.textContent);
      spanCache.set(node, spans);
    }
    for (const span of spans) {
      decorations.push(Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, { class: span.cls }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Syntax highlighting of fenced code blocks, as decorations (no nested editor). */
export function codeHighlightPlugin(): Plugin<DecorationSet> {
  let refresh = () => {};
  return new Plugin<DecorationSet>({
    key: highlightKey,
    state: {
      init: (_config, state) => buildDecorations(state.doc, () => refresh()),
      apply: (tr, value, _old, state) =>
        tr.docChanged || tr.getMeta(highlightKey) ? buildDecorations(state.doc, () => refresh()) : value,
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
