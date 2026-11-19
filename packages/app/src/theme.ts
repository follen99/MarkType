import lightUrl from '@marktype/themes/builtin/light.css?url';
import darkUrl from '@marktype/themes/builtin/dark.css?url';

const LINK_ID = 'mt-theme';

/** Loads a theme stylesheet by URL, replacing the current one. Themes are swapped without reloading. */
export function setThemeUrl(url: string): void {
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== url) link.href = url;
}

/**
 * Until the theme manager lands (milestone M4) the built-in light/dark theme follows the OS setting.
 */
export function applySystemTheme(): void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => setThemeUrl(query.matches ? darkUrl : lightUrl);
  apply();
  query.addEventListener('change', apply);
}
