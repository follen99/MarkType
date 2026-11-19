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
