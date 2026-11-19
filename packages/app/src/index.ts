import { mount } from 'svelte';
import type { Platform } from '@marktype/platform';
import { createTranslator, negotiateLocale } from '@marktype/i18n';
import '@marktype/themes/base.css';
import { applySystemTheme } from './theme.ts';
import App from './App.svelte';

/** Mounts the MarkType UI. Each app (desktop, web) calls this with its own Platform. */
export function startApp(platform: Platform, target: HTMLElement): void {
  document.body.classList.add(`os-${platform.os}`, `platform-${platform.kind}`);
  applySystemTheme();
  const t = createTranslator(negotiateLocale(navigator.languages));
  mount(App, { target, props: { platform, t } });
}
