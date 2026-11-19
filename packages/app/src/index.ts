import { mount } from 'svelte';
import type { Platform } from '@marktype/platform';
import { createTranslator, negotiateLocale } from '@marktype/i18n';
import '@marktype/themes/base.css';
import '@marktype/themes/chrome.css';
import '@marktype/editor/editor.css';
import { ThemeManager } from './theme.svelte.ts';
import App from './App.svelte';

/** Mounts the MarkType UI. Each app (desktop, web) calls this with its own Platform. */
export function startApp(platform: Platform, target: HTMLElement): void {
  document.body.classList.add(`os-${platform.os}`, `platform-${platform.kind}`);
  const t = createTranslator(negotiateLocale(navigator.languages));
  // The theme is applied before the UI is mounted, so the first paint already uses it.
  const themes = new ThemeManager(platform.themes, platform.prefs, t);
  themes.start();
  mount(App, { target, props: { platform, t, themes } });
}
