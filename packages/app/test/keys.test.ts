import { describe, expect, it } from 'vitest';
import {
  formatShortcut,
  normalizeShortcut,
  shortcutCandidates,
  shortcutFromEvent,
} from '../src/commands/keys.ts';
import { DEFAULT_KEYBINDINGS, buildShortcutMap } from '../src/commands/registry.ts';

function key(init: Partial<KeyboardEventInit> & { key: string; code?: string }): KeyboardEvent {
  return {
    key: init.key,
    code: init.code ?? '',
    ctrlKey: !!init.ctrlKey,
    metaKey: !!init.metaKey,
    altKey: !!init.altKey,
    shiftKey: !!init.shiftKey,
    getModifierState: () => false,
  } as unknown as KeyboardEvent;
}

describe('shortcutFromEvent', () => {
  it('uses the layout letter and Ctrl as Mod on Windows', () => {
    expect(shortcutFromEvent(key({ key: 'b', code: 'KeyB', ctrlKey: true }), false)).toBe('Mod+B');
  });
  it('uses Cmd as Mod on macOS', () => {
    expect(shortcutFromEvent(key({ key: 'b', code: 'KeyB', metaKey: true }), true)).toBe('Mod+B');
  });
  it('uses the physical position for punctuation (Italian layout)', () => {
    // The US "[" key types "è" on an Italian keyboard.
    expect(
      shortcutFromEvent(key({ key: 'é', code: 'BracketLeft', ctrlKey: true, shiftKey: true }), false),
    ).toBe('Mod+Shift+[');
  });
  it('falls back to `key` when `code` is missing', () => {
    expect(shortcutFromEvent(key({ key: '/', ctrlKey: true }), false)).toBe('Mod+/');
  });
  it('ignores bare modifiers', () => {
    expect(shortcutFromEvent(key({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), false)).toBeNull();
  });
});

describe('shortcutCandidates on the Italian layout', () => {
  const map = buildShortcutMap(DEFAULT_KEYBINDINGS);
  const resolve = (event: KeyboardEvent) =>
    shortcutCandidates(event, false)
      .map((s) => map.get(s))
      .find(Boolean);

  it('Ctrl+- (the key where US has /) decreases the heading level', () => {
    expect(resolve(key({ key: '-', code: 'Slash', ctrlKey: true }))).toBe('headingDown');
  });
  it('Ctrl++ (the key where US has ]) increases the heading level', () => {
    expect(resolve(key({ key: '+', code: 'BracketRight', ctrlKey: true }))).toBe('headingUp');
  });
  it('Ctrl+Shift+7 types / and toggles source mode', () => {
    expect(resolve(key({ key: '/', code: 'Digit7', ctrlKey: true, shiftKey: true }))).toBe('toggleSource');
  });
  it('Ctrl+Shift+è still means Ctrl+Shift+[ (ordered list)', () => {
    expect(resolve(key({ key: 'é', code: 'BracketLeft', ctrlKey: true, shiftKey: true }))).toBe(
      'orderedList',
    );
  });
});

describe('shortcutCandidates on the US layout', () => {
  const map = buildShortcutMap(DEFAULT_KEYBINDINGS);
  const resolve = (event: KeyboardEvent) =>
    shortcutCandidates(event, false)
      .map((s) => map.get(s))
      .find(Boolean);

  it('Ctrl+Shift+= zooms in instead of changing the heading', () => {
    expect(resolve(key({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }))).toBe('zoomIn');
  });
  it('Ctrl+= increases the heading level', () => {
    expect(resolve(key({ key: '=', code: 'Equal', ctrlKey: true }))).toBe('headingUp');
  });
  it('Ctrl+/ toggles source mode', () => {
    expect(resolve(key({ key: '/', code: 'Slash', ctrlKey: true }))).toBe('toggleSource');
  });
  it('Ctrl+Shift+- zooms out', () => {
    expect(resolve(key({ key: '_', code: 'Minus', ctrlKey: true, shiftKey: true }))).toBe('zoomOut');
  });
});

describe('normalizeShortcut / formatShortcut', () => {
  it('canonicalizes modifier order and names', () => {
    expect(normalizeShortcut('shift+cmd+k')).toBe('Mod+Shift+K');
    expect(normalizeShortcut('Ctrl+Alt+Delete')).toBe('Ctrl+Alt+Delete');
    expect(normalizeShortcut('Mod++')).toBe('Mod++');
  });
  it('formats for each OS', () => {
    expect(formatShortcut('Mod+Shift+K', false)).toBe('Ctrl+Shift+K');
    expect(formatShortcut('Mod+Shift+K', true)).toBe('⇧⌘K');
    expect(formatShortcut('Mod++', false)).toBe('Ctrl++');
  });
});

describe('default keybindings', () => {
  it('have no duplicate shortcuts', () => {
    const all = Object.values(DEFAULT_KEYBINDINGS).flat().map(normalizeShortcut);
    expect(new Set(all).size).toBe(all.length);
    expect(buildShortcutMap(DEFAULT_KEYBINDINGS).get('Mod+B')).toBe('bold');
  });
});
