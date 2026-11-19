import { describe, expect, it, vi } from 'vitest';
import { memoryPrefs } from '@marktype/platform';
import {
  DEFAULT_KEYBINDINGS,
  buildShortcutMap,
  effectiveKeybindings,
  parseUserKeybindings,
} from '../src/commands/registry.ts';
import { normalizeShortcut } from '../src/commands/keys.ts';
import { layoutCss, loadExportSettings, loadLanguage } from '../src/settings.svelte.ts';
import { exportFileName, mimeFor, rewriteCssUrls, escapeHtml } from '../src/export.ts';

describe('memoryPrefs (settings.json)', () => {
  it('reads synchronously and sends only the changed keys, batched', async () => {
    vi.useFakeTimers();
    const persist = vi.fn(async () => {});
    const prefs = memoryPrefs({ autosave: true, theme: { fixed: 'a' } }, persist, 100);
    expect(prefs.get('autosave', false)).toBe(true);
    expect(prefs.get('missing', 7)).toBe(7);
    prefs.set('mode', 'source');
    prefs.set('lastFolder', null);
    prefs.set('mode', 'split');
    expect(prefs.get('mode', '')).toBe('split');
    expect(prefs.get('lastFolder', 'none')).toBe('none');
    expect(persist).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ mode: 'split', lastFolder: null });
    vi.useRealTimers();
  });

  it('keeps copies, so callers cannot change stored values by mutation', async () => {
    const prefs = memoryPrefs({}, null);
    const value = { pattern: 'a' };
    prefs.set('images', value);
    value.pattern = 'b';
    const read = prefs.get<{ pattern: string }>('images', { pattern: '' });
    read.pattern = 'c';
    expect(prefs.get('images', { pattern: '' })).toEqual({ pattern: 'a' });
  });

  it('flush writes at once and survives a failing write', async () => {
    const persist = vi.fn(async () => {
      throw new Error('disk full');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prefs = memoryPrefs({}, persist, 10_000);
    prefs.set('autosave', true);
    await prefs.flush();
    expect(persist).toHaveBeenCalledWith({ autosave: true });
    expect(prefs.get('autosave', false)).toBe(true);
    warn.mockRestore();
  });
});

describe('keybindings.json', () => {
  it('parses strings, lists and null; reports unknown commands and bad values', () => {
    const { bindings, invalid } = parseUserKeybindings({
      '//': 'comment',
      bold: 'Mod+Shift+B',
      italic: ['Mod+I', 'F2'],
      underline: null,
      nope: 'Mod+J',
      save: 42,
      quote: ['', 'Mod+Q'],
    });
    expect(bindings).toEqual({ bold: ['Mod+Shift+B'], italic: ['Mod+I', 'F2'], underline: [] });
    expect(invalid).toEqual(['nope', 'save', 'quote']);
  });

  it('user shortcuts replace the defaults of that command and win over others', () => {
    const merged = effectiveKeybindings({ italic: ['Mod+B'], underline: [] });
    expect(merged.italic).toEqual(['Mod+B']);
    expect(merged.underline).toEqual([]);
    expect(merged.bold).toEqual(DEFAULT_KEYBINDINGS.bold);
    const map = buildShortcutMap(merged);
    expect(map.get(normalizeShortcut('Mod+U'))).toBeUndefined();
    // Both bold (default) and italic (user) claim Mod+B: the user's binding, later in the list, wins.
    expect(map.get(normalizeShortcut('Mod+B'))).toBe('italic');
    expect(map.get(normalizeShortcut('Mod+,'))).toBe('preferences');
  });
});

describe('app settings', () => {
  it('layout CSS overrides font size and page width only when set', () => {
    expect(layoutCss(null, null)).toBe('');
    expect(layoutCss(18, null)).toContain('font-size: 18px');
    expect(layoutCss(null, 0)).toContain('max-width: none');
    expect(layoutCss(null, 1000)).toContain('max-width: 1000px');
  });

  it('ignores invalid stored values', () => {
    const prefs = memoryPrefs({ language: 'klingon', export: { embedImages: 'yes', pandocPath: 3 } }, null);
    expect(loadLanguage(prefs)).toBe('auto');
    expect(loadExportSettings(prefs)).toEqual({ embedImages: false, pandocPath: '' });
    const good = memoryPrefs(
      { language: 'it', export: { embedImages: true, pandocPath: 'C:/p/pandoc.exe' } },
      null,
    );
    expect(loadLanguage(good)).toBe('it');
    expect(loadExportSettings(good)).toEqual({ embedImages: true, pandocPath: 'C:/p/pandoc.exe' });
  });
});

describe('export helpers', () => {
  it('names exported files after the document', () => {
    expect(exportFileName('notes.md', 'html')).toBe('notes.html');
    expect(exportFileName('My Book.markdown', 'epub')).toBe('My Book.epub');
    expect(exportFileName('Untitled', 'pdf')).toBe('Untitled.pdf');
  });

  it('guesses MIME types from extensions', () => {
    expect(mimeFor('C:\\img\\a.PNG')).toBe('image/png');
    expect(mimeFor('http://asset.localhost/f/font.woff2?v=2')).toBe('font/woff2');
    expect(mimeFor('noext')).toBe('application/octet-stream');
  });

  it('escapes HTML text', () => {
    expect(escapeHtml('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });

  it('rewrites relative url()s of a theme, leaving data/http/fragments alone', async () => {
    const css = `@font-face { src: url('./fonts/a.woff2') format('woff2'), url(b.ttf); }
#write { background: url("data:image/png;base64,xx"); }
.x { background: url(https://example.com/x.png); mask: url(#m); }
.y { background: url( './fonts/a.woff2' ); }`;
    const seen: string[] = [];
    const out = await rewriteCssUrls(css, 'http://asset.localhost/C%3A/themes/my.css', async (abs) => {
      seen.push(abs);
      return abs.endsWith('b.ttf') ? null : `data:font/woff2;base64,AA`;
    });
    expect(seen).toEqual([
      'http://asset.localhost/C%3A/themes/fonts/a.woff2',
      'http://asset.localhost/C%3A/themes/b.ttf',
    ]);
    expect(out).toContain(`src: url("data:font/woff2;base64,AA") format('woff2'), url(b.ttf);`);
    expect(out).toContain('url("data:image/png;base64,xx")');
    expect(out).toContain('url(https://example.com/x.png)');
    expect(out).toContain('url(#m)');
    expect(out).toContain('.y { background: url("data:font/woff2;base64,AA"); }');
  });
});

describe('memoryPrefs with reactive values', () => {
  it('stores Svelte-style proxies (structuredClone would throw on them)', () => {
    const prefs = memoryPrefs({}, null);
    const proxy = new Proxy(['C:/notes/a.md'], {});
    expect(() => prefs.set('recentFiles', proxy)).not.toThrow();
    expect(prefs.get<string[]>('recentFiles', [])).toEqual(['C:/notes/a.md']);
  });
});
