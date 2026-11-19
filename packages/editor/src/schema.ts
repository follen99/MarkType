import { Schema, type DOMOutputSpec, type NodeSpec, type MarkSpec, type Attrs } from 'prosemirror-model';

/**
 * Document schema. The DOM produced by `toDOM` mirrors Typora's (#write children with md-* classes)
 * so Typora themes apply unchanged. See docs/THEMES.md.
 */

export type RawBlockKind = 'html' | 'frontmatter' | 'math' | 'footnote' | 'markdown';
export type RawInlineKind = 'html' | 'math' | 'footnote' | 'markdown';
export type CellAlign = 'left' | 'center' | 'right' | null;
export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

/** Inline HTML tags without attributes that are edited as formatting (`<kbd>x</kbd>`). */
export const HTML_TAG_MARKS = [
  'kbd',
  'sup',
  'sub',
  'mark',
  'small',
  'big',
  'ins',
  'del',
  's',
  'b',
  'i',
  'em',
  'strong',
  'abbr',
  'cite',
  'q',
  'samp',
  'var',
  'tt',
] as const;

const RAW_BLOCK_CLASS: Record<RawBlockKind, string> = {
  html: 'md-htmlblock md-rawblock',
  frontmatter: 'md-meta-block md-rawblock',
  math: 'md-math-block md-rawblock',
  footnote: 'md-def-footnote md-rawblock',
  markdown: 'md-rawblock md-raw-markdown',
};

function alignAttrs(align: CellAlign): Attrs {
  return align ? { style: `text-align: ${align}`, 'data-align': align } : {};
}

function parseAlign(dom: HTMLElement): CellAlign {
  const value = dom.getAttribute('data-align') ?? dom.style.textAlign;
  return value === 'left' || value === 'center' || value === 'right' ? value : null;
}

const nodes = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    parseDOM: [{ tag: 'p' }],
    toDOM: (): DOMOutputSpec => ['p', { class: 'md-end-block md-p' }, 0],
  },

  heading: {
    group: 'block',
    content: 'inline*',
    attrs: { level: { default: 1, validate: 'number' } },
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: (node): DOMOutputSpec => [`h${node.attrs.level}`, { class: 'md-end-block md-heading' }, 0],
  },

  blockquote: {
    group: 'block',
    content: 'block+',
    defining: true,
    /** GitHub alert type (`> [!NOTE]`), or null for a plain quote. */
    attrs: { alert: { default: null } },
    parseDOM: [
      { tag: 'blockquote', getAttrs: (dom: HTMLElement) => ({ alert: dom.getAttribute('data-alert') }) },
    ],
    toDOM: (node): DOMOutputSpec => {
      const alert = node.attrs.alert as AlertType | null;
      return alert
        ? ['blockquote', { class: `md-alert md-alert-${alert}`, 'data-alert': alert }, 0]
        : ['blockquote', 0];
    },
  },

  code_block: {
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    attrs: {
      language: { default: '', validate: 'string' },
      meta: { default: '', validate: 'string' },
    },
    parseDOM: [
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (dom: HTMLElement) => ({ language: dom.getAttribute('lang') ?? '', meta: '' }),
      },
    ],
    toDOM: (node): DOMOutputSpec => [
      'pre',
      {
        class: 'md-fences md-end-block',
        lang: node.attrs.language || null,
        spellcheck: 'false',
      },
      ['code', 0],
    ],
  },

  /** Markdown the editor shows as editable source: HTML blocks, front matter, math, unsupported syntax. */
  raw_block: {
    group: 'block',
    content: 'text*',
    marks: '',
    code: true,
    defining: true,
    attrs: { kind: { default: 'markdown', validate: 'string' } },
    parseDOM: [
      {
        tag: 'pre.md-rawblock',
        preserveWhitespace: 'full',
        getAttrs: (dom: HTMLElement) => ({ kind: dom.getAttribute('data-kind') ?? 'markdown' }),
      },
    ],
    toDOM: (node): DOMOutputSpec => [
      'pre',
      {
        class: RAW_BLOCK_CLASS[node.attrs.kind as RawBlockKind] ?? RAW_BLOCK_CLASS.markdown,
        'data-kind': node.attrs.kind,
        spellcheck: 'false',
      },
      ['code', 0],
    ],
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM: (): DOMOutputSpec => ['hr'],
  },

  bullet_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { tight: { default: true } },
    parseDOM: [{ tag: 'ul', getAttrs: (dom: HTMLElement) => ({ tight: dom.hasAttribute('data-tight') }) }],
    toDOM: (node): DOMOutputSpec => ['ul', { 'data-tight': node.attrs.tight ? 'true' : null }, 0],
  },

  ordered_list: {
    group: 'block',
    content: 'list_item+',
    attrs: { order: { default: 1, validate: 'number' }, tight: { default: true } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom: HTMLElement) => ({
          order: dom.hasAttribute('start') ? Number(dom.getAttribute('start')) : 1,
          tight: dom.hasAttribute('data-tight'),
        }),
      },
    ],
    toDOM: (node): DOMOutputSpec => [
      'ol',
      {
        start: node.attrs.order === 1 ? null : node.attrs.order,
        'data-tight': node.attrs.tight ? 'true' : null,
      },
      0,
    ],
  },

  list_item: {
    content: 'block+',
    defining: true,
    /** null = normal item, true/false = task list item. */
    attrs: { checked: { default: null } },
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom: HTMLElement) => {
          const box = dom.querySelector(':scope > input[type=checkbox]');
          return { checked: box ? (box as HTMLInputElement).checked : null };
        },
      },
    ],
    toDOM: (node): DOMOutputSpec => {
      if (node.attrs.checked === null) return ['li', { class: 'md-list-item' }, 0];
      return [
        'li',
        {
          class: `md-list-item md-task-list-item task-list-item${node.attrs.checked ? ' task-list-done' : ''}`,
        },
        [
          'input',
          {
            type: 'checkbox',
            class: 'task-list-item-checkbox',
            contenteditable: 'false',
            checked: node.attrs.checked ? 'checked' : null,
          },
        ],
        ['div', { class: 'md-task-content' }, 0],
      ];
    },
  },

  table: {
    group: 'block',
    content: 'table_row+',
    tableRole: 'table',
    isolating: true,
    parseDOM: [{ tag: 'table' }],
    toDOM: (): DOMOutputSpec => ['table', { class: 'md-table' }, ['tbody', 0]],
  },

  table_row: {
    content: '(table_cell | table_header)*',
    tableRole: 'row',
    parseDOM: [{ tag: 'tr' }],
    toDOM: (): DOMOutputSpec => ['tr', 0],
  },

  table_header: {
    content: 'inline*',
    tableRole: 'header_cell',
    isolating: true,
    attrs: {
      align: { default: null },
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colwidth: { default: null },
    },
    parseDOM: [{ tag: 'th', getAttrs: (dom: HTMLElement) => ({ align: parseAlign(dom) }) }],
    toDOM: (node): DOMOutputSpec => ['th', alignAttrs(node.attrs.align as CellAlign), 0],
  },

  table_cell: {
    content: 'inline*',
    tableRole: 'cell',
    isolating: true,
    attrs: {
      align: { default: null },
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colwidth: { default: null },
    },
    parseDOM: [{ tag: 'td', getAttrs: (dom: HTMLElement) => ({ align: parseAlign(dom) }) }],
    toDOM: (node): DOMOutputSpec => ['td', alignAttrs(node.attrs.align as CellAlign), 0],
  },

  text: { group: 'inline' },

  image: {
    group: 'inline',
    inline: true,
    draggable: true,
    attrs: {
      src: { validate: 'string' },
      alt: { default: '' },
      title: { default: null },
    },
    parseDOM: [
      {
        tag: 'img[src]',
        getAttrs: (dom: HTMLElement) => ({
          src: dom.getAttribute('data-src') ?? dom.getAttribute('src'),
          alt: dom.getAttribute('alt') ?? '',
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (node): DOMOutputSpec => [
      'span',
      { class: 'md-image md-img-loaded' },
      ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }],
    ],
  },

  hard_break: {
    group: 'inline',
    inline: true,
    selectable: false,
    /** `raw` keeps the HTML spelling (`<br>`, `<br/>`) of breaks written as HTML. */
    attrs: { raw: { default: null } },
    parseDOM: [{ tag: 'br' }],
    toDOM: (): DOMOutputSpec => ['br'],
  },

  /** `[toc]`: table of contents of the document, generated from its headings. */
  toc: {
    group: 'block',
    atom: true,
    selectable: true,
    attrs: { text: { default: '[toc]' } },
    parseDOM: [
      { tag: 'div.md-toc', getAttrs: (dom: HTMLElement) => ({ text: dom.dataset.text ?? '[toc]' }) },
    ],
    toDOM: (node): DOMOutputSpec => ['div', { class: 'md-toc', 'data-text': node.attrs.text }],
  },
} satisfies Record<string, NodeSpec>;

// Order = nesting order when serializing (outermost first). `code` and `raw` hold literal text.
const marks = {
  link: {
    attrs: { href: { validate: 'string' }, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (mark): DOMOutputSpec => ['a', { href: mark.attrs.href, title: mark.attrs.title }, 0],
  },

  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: (): DOMOutputSpec => ['strong', 0],
  },

  em: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: (): DOMOutputSpec => ['em', 0],
  },

  strike: {
    parseDOM: [{ tag: 'del' }, { tag: 's' }],
    toDOM: (): DOMOutputSpec => ['del', 0],
  },

  underline: {
    parseDOM: [{ tag: 'u' }],
    toDOM: (): DOMOutputSpec => ['u', 0],
  },

  /** `==text==` (Typora highlight). */
  highlight: {
    parseDOM: [{ tag: 'mark.md-highlight' }],
    toDOM: (): DOMOutputSpec => ['mark', { class: 'md-highlight' }, 0],
  },

  /** An inline HTML tag without attributes, kept as written (`<kbd>Ctrl</kbd>`). */
  htmltag: {
    attrs: { tag: { validate: 'string' } },
    excludes: '',
    parseDOM: (HTML_TAG_MARKS as readonly string[]).map((tag) => ({
      tag: `${tag}.md-htmltag`,
      attrs: { tag },
    })),
    toDOM: (mark): DOMOutputSpec => [mark.attrs.tag as string, { class: 'md-htmltag md-html-inline' }, 0],
  },

  code: {
    code: true,
    excludes: 'code raw',
    parseDOM: [{ tag: 'code' }],
    toDOM: (): DOMOutputSpec => ['code', 0],
  },

  /** Inline syntax shown as source (inline HTML, inline math, references…), edited as plain text. */
  raw: {
    code: true,
    inclusive: false,
    excludes: 'raw code',
    attrs: { kind: { default: 'markdown', validate: 'string' } },
    parseDOM: [
      {
        tag: 'span.md-raw-inline',
        getAttrs: (dom: HTMLElement) => ({ kind: dom.getAttribute('data-kind') ?? 'markdown' }),
      },
    ],
    toDOM: (mark): DOMOutputSpec => [
      'span',
      { class: `md-raw-inline md-raw-${mark.attrs.kind}`, 'data-kind': mark.attrs.kind, spellcheck: 'false' },
      0,
    ],
  },
} satisfies Record<string, MarkSpec>;

export type NodeName = keyof typeof nodes;
export type MarkName = keyof typeof marks;

export const schema = new Schema<NodeName, MarkName>({ nodes, marks });
