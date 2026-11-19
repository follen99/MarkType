import { describe, expect, it } from 'vitest';
import { htmlHasText, htmlToMarkdown } from '../src/markdown/html.ts';
import { parseMarkdown } from '../src/markdown/parse.ts';
import { serializeMarkdown } from '../src/markdown/serialize.ts';

describe('pasted HTML → markdown', () => {
  it('converts headings, emphasis, links and images', async () => {
    const md = await htmlToMarkdown(
      '<h2>Title</h2><p>Some <b>bold</b>, <i>italic</i> and <a href="https://x.org">a link</a>.</p>' +
        '<p><img src="https://x.org/a.png" alt="pic"></p>',
    );
    expect(md).toBe(
      '## Title\n\nSome **bold**, *italic* and [a link](https://x.org).\n\n![pic](https://x.org/a.png)\n',
    );
  });

  it('converts lists, code and tables', async () => {
    const md = await htmlToMarkdown(
      '<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>' +
        '<pre><code class="language-js">let a = 1;\n</code></pre>' +
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(md).toBe(
      '- one\n- two\n\n1. first\n\n```js\nlet a = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |\n',
    );
  });

  it('keeps only the copied fragment of a Windows clipboard document', async () => {
    const html =
      '<html><head><style>p{color:red}</style></head><body><!--StartFragment--><p>Hello<o:p></o:p></p>' +
      '<!--EndFragment--></body></html>';
    expect(await htmlToMarkdown(html)).toBe('Hello\n');
  });

  it('produces markdown the editor round-trips', async () => {
    const md = await htmlToMarkdown(
      '<p>A <code>x</code> <del>gone</del></p><blockquote><p>quote</p></blockquote>',
    );
    expect(serializeMarkdown(parseMarkdown(md))).toBe(md);
  });

  it('tells text apart from a lone copied image', () => {
    expect(htmlHasText('<img src="a.png">')).toBe(false);
    expect(htmlHasText('<!--StartFragment--><img src="a.png">&nbsp;<!--EndFragment-->')).toBe(false);
    expect(htmlHasText('<p>hi <img src="a.png"></p>')).toBe(true);
  });
});

describe('slugify (export heading ids)', () => {
  it('makes readable unique ids', async () => {
    const { slugify } = await import('../src/export.ts');
    const used = new Set<string>();
    expect(slugify('Perché è così?', used)).toBe('perche-e-cosi');
    expect(slugify('Perché è così?', used)).toBe('perche-e-cosi-1');
    expect(slugify('  Hello   World! ', used)).toBe('hello-world');
    expect(slugify('***', used)).toBe('section');
    expect(slugify('日本語 1', used)).toBe('日本語-1');
  });
});
