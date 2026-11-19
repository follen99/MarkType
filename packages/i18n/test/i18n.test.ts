import { describe, expect, it } from 'vitest';
import en from '../src/locales/en.json';
import itMessages from '../src/locales/it.json';
import { createTranslator, negotiateLocale } from '../src/index.ts';

describe('negotiateLocale', () => {
  it('matches on the base language', () => {
    expect(negotiateLocale(['it-IT', 'en-US'])).toBe('it');
  });
  it('skips unsupported languages', () => {
    expect(negotiateLocale(['de-DE', 'en-GB'])).toBe('en');
  });
  it('falls back to English', () => {
    expect(negotiateLocale([])).toBe('en');
  });
});

describe('createTranslator', () => {
  it('interpolates parameters', () => {
    expect(createTranslator('it')('status.version', { version: '1.2.3' })).toBe('Versione 1.2.3');
  });
});

describe('catalogs', () => {
  it('have the same keys in every language', () => {
    expect(Object.keys(itMessages).sort()).toEqual(Object.keys(en).sort());
  });
});
