import { describe, expect, it } from 'vitest';
import type { PrefsApi, ThemesApi } from '@marktype/platform';
import { ThemeManager } from '../src/theme.svelte.ts';

function memoryPrefs(initial: Record<string, unknown> = {}): PrefsApi & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: <T>(key: string, fallback: T) => (key in data ? (data[key] as T) : fallback),
    set: (key, value) => void (data[key] = value),
  };
}

const t = ((key: string) => key) as never;

const userApi: ThemesApi = {
  list: async () => ({
    themes: [
      { id: 'vue', name: 'Vue', url: 'asset://vue.css', dark: false, userCssUrl: null },
      {
        id: 'night',
        name: 'Night',
        url: 'asset://night.css',
        dark: true,
        userCssUrl: 'asset://night.user.css',
      },
    ],
    baseUserCssUrl: null,
  }),
  onChange: async () => () => undefined,
  openFolder: async () => undefined,
};

describe('ThemeManager', () => {
  it('follows the system with the default light and dark themes', () => {
    const themes = new ThemeManager(null, memoryPrefs(), t);
    expect(themes.followSystem).toBe(true);
    expect(themes.active.id).toBe('builtin:light');
    themes.systemDark = true;
    expect(themes.active.id).toBe('builtin:dark');
  });

  it('while following the system, a chosen theme replaces the one of its kind', () => {
    const prefs = memoryPrefs();
    const themes = new ThemeManager(null, prefs, t);
    themes.select('builtin:formal-dark-pro');
    themes.select('builtin:paper');
    expect(themes.lightId).toBe('builtin:paper');
    expect(themes.darkId).toBe('builtin:formal-dark-pro');
    themes.systemDark = true;
    expect(themes.active.id).toBe('builtin:formal-dark-pro');
    const selected = themes.all.filter((theme) => themes.isSelected(theme)).map((theme) => theme.id);
    expect(selected).toEqual(['builtin:paper', 'builtin:formal-dark-pro']);
    expect(prefs.data['theme']).toMatchObject({ followSystem: true, light: 'builtin:paper' });
  });

  it('turning off "follow system" keeps the current theme fixed', () => {
    const themes = new ThemeManager(null, memoryPrefs(), t);
    themes.systemDark = true;
    themes.toggleFollowSystem();
    themes.systemDark = false;
    expect(themes.active.id).toBe('builtin:dark');
    themes.select('builtin:paper');
    expect(themes.active.id).toBe('builtin:paper');
    expect(themes.all.filter((theme) => themes.isSelected(theme))).toHaveLength(1);
  });

  it('lists user themes and falls back to a built-in one when the chosen theme disappears', async () => {
    const prefs = memoryPrefs({
      theme: { followSystem: false, fixed: 'user:night', light: 'builtin:light', dark: 'builtin:dark' },
    });
    const themes = new ThemeManager(userApi, prefs, t);
    expect(themes.active.id).toBe('builtin:light');
    await themes.reload();
    expect(themes.all.map((theme) => theme.id)).toContain('user:vue');
    expect(themes.active.id).toBe('user:night');
    expect(themes.active.userCssUrl).toBe('asset://night.user.css');
  });
});
