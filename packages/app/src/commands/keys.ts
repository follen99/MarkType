/**
 * Shortcut strings look like `Mod+Shift+K`. `Mod` is Ctrl on Windows/Linux and Cmd on macOS.
 * Letters follow the active keyboard layout; other keys use their physical (US) position, so
 * `Mod+Shift+[` works on every layout.
 */

const CODE_KEYS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  NumpadAdd: '=',
  NumpadSubtract: '-',
};

const MODIFIER_ORDER = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;

const PRINTABLE_KEYS = new Set(Object.values(CODE_KEYS).filter((k) => k.length === 1));
const NAMED_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
};

/** Some virtual keyboards, remote desktops and synthetic events leave `code` empty: use `key`. */
function keyNameFromKey(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^\d$/.test(key) || PRINTABLE_KEYS.has(key)) return key;
  if (/^F\d{1,2}$/.test(key)) return key;
  if (NAMED_KEYS[key]) return NAMED_KEYS[key]!;
  return Object.values(CODE_KEYS).includes(key) ? key : null;
}

function keyName(event: KeyboardEvent): string | null {
  const { code, key } = event;
  if (!code) return keyNameFromKey(key);
  if (code.startsWith('Key')) {
    // Layout-aware letter when the layout is Latin, physical letter otherwise.
    return /^[a-z]$/i.test(key) ? key.toUpperCase() : code.slice(3);
  }
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad') && /^\d$/.test(code.slice(6))) return code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  return CODE_KEYS[code] ?? null;
}

export function shortcutFromEvent(event: KeyboardEvent, isMac: boolean): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) return null;
  // AltGr (reported as Ctrl+Alt on Windows) types characters such as [ ] @ # on many layouts.
  if (event.getModifierState?.('AltGraph')) return null;
  const key = keyName(event);
  if (!key) return null;
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('Mod');
  if (isMac && event.ctrlKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/** Canonical form of a user-written shortcut (`shift+mod+k` → `Mod+Shift+K`). */
export function normalizeShortcut(shortcut: string): string {
  const tokens = shortcut.split('+').map((t) => t.trim());
  const rawKey = tokens.pop() ?? '';
  const modifiers = new Set(
    tokens.filter(Boolean).map((t) => {
      const lower = t.toLowerCase();
      if (lower === 'cmd' || lower === 'command' || lower === 'mod' || lower === 'cmdorctrl') return 'Mod';
      if (lower === 'control' || lower === 'ctrl') return 'Ctrl';
      if (lower === 'option' || lower === 'alt') return 'Alt';
      return lower === 'shift' ? 'Shift' : t;
    }),
  );
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), key].join('+');
}

/** Human-readable label for menus: `Ctrl+Shift+K` / `⇧⌘K`. */
export function formatShortcut(shortcut: string, isMac: boolean): string {
  const parts = normalizeShortcut(shortcut).split('+');
  const key = parts.pop() ?? '';
  if (isMac) {
    const symbols: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
    const order = ['Ctrl', 'Alt', 'Shift', 'Mod'];
    return (
      order
        .filter((m) => parts.includes(m))
        .map((m) => symbols[m])
        .join('') + key
    );
  }
  return [...parts.map((m) => (m === 'Mod' ? 'Ctrl' : m)), key].join('+');
}
