import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/markdown/parse.ts';
import { serializeMarkdown } from '../src/markdown/serialize.ts';
import { schema } from '../src/schema.ts';

const fixtures = join(import.meta.dirname, 'fixtures');
const read = (dir: string) =>
  readdirSync(join(fixtures, dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => [f, readFileSync(join(fixtures, dir, f), 'utf8').replace(/\r\n/g, '\n')] as const);

const roundtrip = (markdown: string) => serializeMarkdown(parseMarkdown(markdown));

describe('canonical fixtures are preserved byte for byte', () => {
  for (const [name, source] of read('canonical')) {
    it(name, () => {
      expect(roundtrip(source)).toBe(source);
    });
  }
});

describe('messy fixtures become stable after one save', () => {
  for (const [name, source] of read('messy')) {
    it(name, () => {
      const once = roundtrip(source);
      expect(roundtrip(once)).toBe(once);
      expect(once).toMatchSnapshot();
    });
  }
});

describe('document structure', () => {
  it('parses task items', () => {
    const doc = parseMarkdown('- [x] done\n- [ ] todo\n');
    const list = doc.firstChild!;
    expect(list.type.name).toBe('bullet_list');
    expect(list.child(0).attrs.checked).toBe(true);
    expect(list.child(1).attrs.checked).toBe(false);
  });

  it('maps inline <u> to the underline mark', () => {
    const doc = parseMarkdown('a <u>b</u> c\n');
    const b = doc.firstChild!.child(1);
    expect(b.text).toBe('b');
    expect(b.marks.map((m) => m.type.name)).toEqual(['underline']);
  });

  it('parses ==highlight==, inline HTML tags and <br>', () => {
    const p = parseMarkdown('a ==b== <kbd>K</kbd> x<br/>y\n').firstChild!;
    const names = (i: number) => p.child(i).marks.map((m) => m.type.name);
    expect(p.child(1).text).toBe('b');
    expect(names(1)).toEqual(['highlight']);
    expect(p.child(3).text).toBe('K');
    expect(p.child(3).marks[0]!.attrs.tag).toBe('kbd');
    const br = p.child(5);
    expect(br.type.name).toBe('hard_break');
    expect(br.attrs.raw).toBe('<br/>');
  });

  it('keeps an unclosed inline tag as source', () => {
    const p = parseMarkdown('a <kbd> b\n').firstChild!;
    expect(p.child(1).marks[0]!.type.name).toBe('raw');
    expect(p.child(1).text).toBe('<kbd>');
  });

  it('turns a paragraph with only [toc] into a TOC block', () => {
    const doc = parseMarkdown('[TOC]\n\n# A\n');
    expect(doc.firstChild!.type.name).toBe('toc');
    expect(serializeMarkdown(doc)).toBe('[TOC]\n\n# A\n');
  });

  it('marks footnote references and definitions', () => {
    const doc = parseMarkdown('x[^1]\n\n[^1]: note\n');
    expect(doc.firstChild!.child(1).marks[0]!.attrs.kind).toBe('footnote');
    expect(doc.child(1).attrs.kind).toBe('footnote');
  });

  it('keeps unknown syntax as raw source', () => {
    const doc = parseMarkdown('[ref]: https://example.com\n');
    expect(doc.firstChild!.type.name).toBe('raw_block');
    expect(doc.firstChild!.textContent).toBe('[ref]: https://example.com');
  });

  it('never produces an empty document', () => {
    expect(parseMarkdown('').childCount).toBe(1);
    expect(serializeMarkdown(parseMarkdown(''))).toBe('');
  });

  it('escapes markdown characters typed as plain text', () => {
    const { nodes } = schema;
    const doc = nodes.doc.create(null, nodes.paragraph.create(null, schema.text('*not italic*')));
    expect(serializeMarkdown(doc)).toBe('\\*not italic\\*\n');
  });

  it('writes the alert marker back for alerts without content', () => {
    const { nodes } = schema;
    const doc = nodes.doc.create(null, nodes.blockquote.create({ alert: 'tip' }, nodes.paragraph.create()));
    expect(serializeMarkdown(doc)).toBe('> [!TIP]\n');
  });
});
