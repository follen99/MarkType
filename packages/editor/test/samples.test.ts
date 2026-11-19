import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/markdown/parse.ts';
import { serializeMarkdown } from '../src/markdown/serialize.ts';

const samples = join(import.meta.dirname, '../../../samples');

describe('sample documents survive an edit-and-save unchanged', () => {
  for (const name of readdirSync(samples).filter((f) => f.endsWith('.md'))) {
    it(name, () => {
      const source = readFileSync(join(samples, name), 'utf8').replace(/\r\n/g, '\n');
      expect(serializeMarkdown(parseMarkdown(source))).toBe(source);
    });
  }
});
