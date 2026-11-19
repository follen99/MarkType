import { describe, expect, it } from 'vitest';
import { decodeText, encodeText } from '../src/document.svelte.ts';

describe('decodeText / encodeText', () => {
  it('round-trips CRLF files with a BOM byte for byte', () => {
    const raw = '﻿# Title\r\n\r\nText\r\n';
    const decoded = decodeText(raw);
    expect(decoded).toEqual({ text: '# Title\n\nText\n', bom: true, eol: '\r\n' });
    expect(encodeText(decoded.text, decoded.bom, decoded.eol)).toBe(raw);
  });

  it('keeps LF files as they are', () => {
    const decoded = decodeText('a\nb\n');
    expect(decoded.eol).toBe('\n');
    expect(encodeText(decoded.text, decoded.bom, decoded.eol)).toBe('a\nb\n');
  });

  it('normalizes stray CR line endings', () => {
    expect(decodeText('a\rb').text).toBe('a\nb');
  });
});
