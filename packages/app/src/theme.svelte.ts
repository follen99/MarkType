import { refreshPreviews } from '@marktype/editor';
import type { MessageKey, Translate } from '@marktype/i18n';
import type { PrefsApi, ThemesApi, Unsubscribe } from '@marktype/platform';
import lightUrl from '@marktype/themes/builtin/light.css?url';
import darkUrl from '@marktype/themes/builtin/dark.css?url';
import paperUrl from '@marktype/themes/builtin/paper.css?url';
import formalDarkProUrl from '@marktype/themes/builtin/formal-dark-pro/formal-dark-pro.css?url';

export interface ThemeOption {
  /** `builtin:<name>` or `user:<file stem>`. */
  id: string;
  name: string;
  url: string;
  dark: boolean;
  userCssUrl: string | null;
}

interface Builtin {
  id: string;
  label: MessageKey | null;
  name: string;
  url: string;
  dark: boolean;
}

const BUILTINS: Builtin[] = [
  { id: 'builtin:light', label: 'theme.light', name: 'Light', url: lightUrl, dark: false },
  { id: 'builtin:paper', label: 'theme.paper', name: 'Paper', url: paperUrl, dark: false },
  { id: 'builtin:dark', label: 'theme.dark', name: 'Dark', url: darkUrl, dark: true },
  { id: 'builtin:formal-dark-pro', label: null, name: 'Formal Dark Pro', url: formalDarkProUrl, dark: true },
];

const DEFAULT_LIGHT = 'builtin:light';
const DEFAULT_DARK = 'builtin:dark';

/** Saved choice. With `followSystem` the theme switches between `light` and `dark` with the OS. */
interface ThemePrefs {
  followSystem: boolean;
  light: string;
  dark: string;
  fixed: string;
}

/** `<link>` ids, in load order: base.css (bundled) → theme → base.user.css → <theme>.user.css. */
const LINK_IDS = ['mt-theme', 'mt-theme-base-user', 'mt-theme-user'] as const;

function ensureLinks(): HTMLLinkElement[] {
  return LINK_IDS.map((id) => {
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      // Diagrams and math previews pick up the new colours and fonts once the stylesheet is in.
      link.addEventListener('load', () => refreshPreviews());
      document.head.appendChild(link);
    }
    return link;
  });
}

/**
 * Lazy chunks (KaTeX, Mermaid…) append their stylesheets to `<head>` later on. Themes must stay last to win
 * over them, as in Typora where the theme is the final stylesheet.
 */
function keepLinksLast(links: HTMLLinkElement[]): () => void {
  const first = links[0]!;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        const sheet =
          node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === 'stylesheet');
        // Move the newcomer, not the theme: re-inserting a loaded <link> would make it load again (flash).
        if (
          sheet &&
          !links.includes(node as HTMLLinkElement) &&
          first.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
        ) {
          document.head.insertBefore(node, first);
        }
      }
    }
  });
  observer.observe(document.head, { childList: true });
  return () => observer.disconnect();
}

function setHref(link: HTMLLinkElement, url: string | null): void {
  if (url) {
    if (link.getAttribute('href') !== url) link.href = url;
    link.disabled = false;
  } else {
    link.removeAttribute('href');
    link.disabled = true;
  }
}

/** Adds a revision so the webview reloads a changed file instead of using its cache. */
function withRevision(url: string | null, revision: number): string | null {
  if (!url || revision === 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${revision}`;
}

/**
 * Chooses, loads and live-reloads the theme (docs/THEMES.md). Typora themes are plain stylesheets loaded as
 * `<link>` elements, so relative `url()`s inside them resolve next to the theme file.
 */
export class ThemeManager {
  userThemes = $state<ThemeOption[]>([]);
  baseUserCssUrl = $state<string | null>(null);
  followSystem = $state(true);
  lightId = $state(DEFAULT_LIGHT);
  darkId = $state(DEFAULT_DARK);
  fixedId = $state(DEFAULT_LIGHT);
  systemDark = $state(false);
  /** Bumped on every change in the themes folder. */
  private revision = $state(0);

  readonly builtins: ThemeOption[];
  readonly activeId = $derived(
    this.followSystem ? (this.systemDark ? this.darkId : this.lightId) : this.fixedId,
  );
  readonly active = $derived<ThemeOption>(this.resolve(this.activeId));

  constructor(
    private readonly api: ThemesApi | null,
    private readonly prefs: PrefsApi,
    t: Translate,
  ) {
    this.builtins = BUILTINS.map((b) => ({
      id: b.id,
      name: b.label ? t(b.label) : b.name,
      url: b.url,
      dark: b.dark,
      userCssUrl: null,
    }));
    const saved = prefs.get<Partial<ThemePrefs>>('theme', {});
    this.followSystem = saved.followSystem ?? true;
    this.lightId = saved.light ?? DEFAULT_LIGHT;
    this.darkId = saved.dark ?? DEFAULT_DARK;
    this.fixedId = saved.fixed ?? DEFAULT_LIGHT;
  }

  /** Built-in themes first, then the user's. */
  get all(): ThemeOption[] {
    return [...this.builtins, ...this.userThemes];
  }

  /** The theme with `id`, or a built-in fallback when it was removed from the themes folder. */
  private resolve(id: string): ThemeOption {
    const found = this.all.find((theme) => theme.id === id);
    if (found) return found;
    const wantDark = this.followSystem && this.systemDark;
    return this.builtins.find((b) => b.id === (wantDark ? DEFAULT_DARK : DEFAULT_LIGHT))!;
  }

  /** Starts following the OS and the themes folder; applies the theme whenever it changes. */
  start(): Unsubscribe {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark = query.matches;
    const onScheme = () => (this.systemDark = query.matches);
    query.addEventListener('change', onScheme);

    const links = ensureLinks();
    const stopKeepLast = keepLinksLast(links);
    const stopApply = $effect.root(() => {
      $effect(() => {
        const theme = this.active;
        const [main, baseUser, themeUser] = links as [HTMLLinkElement, HTMLLinkElement, HTMLLinkElement];
        const user = theme.id.startsWith('user:');
        setHref(main, user ? withRevision(theme.url, this.revision) : theme.url);
        setHref(baseUser, withRevision(this.baseUserCssUrl, this.revision));
        setHref(themeUser, withRevision(theme.userCssUrl, this.revision));
        // Scrollbars and form controls follow the theme, not the OS.
        document.documentElement.style.colorScheme = theme.dark ? 'dark' : 'light';
        document.documentElement.classList.toggle('mt-theme-dark', theme.dark);
      });
    });

    let stopWatch: Unsubscribe | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (this.api) {
      void this.reload();
      void this.api
        .onChange(() => {
          // Editors save in several steps (truncate, write, rename): reload once they are done.
          clearTimeout(timer);
          timer = setTimeout(() => {
            this.revision++;
            void this.reload();
          }, 150);
        })
        .then((off) => (stopWatch = off))
        .catch(() => undefined);
    }

    return () => {
      query.removeEventListener('change', onScheme);
      clearTimeout(timer);
      stopWatch?.();
      stopApply();
      stopKeepLast();
    };
  }

  /** Re-reads the themes folder. */
  async reload(): Promise<void> {
    if (!this.api) return;
    try {
      const list = await this.api.list();
      this.userThemes = list.themes.map((theme) => ({
        id: `user:${theme.id}`,
        name: theme.name,
        url: theme.url,
        dark: theme.dark,
        userCssUrl: theme.userCssUrl,
      }));
      this.baseUserCssUrl = list.baseUserCssUrl;
    } catch {
      // The folder cannot be read: keep the built-in themes.
    }
  }

  /** True for the theme(s) the menu shows as selected: one per kind while following the OS. */
  isSelected(theme: ThemeOption): boolean {
    if (!this.followSystem) return theme.id === this.fixedId;
    return theme.id === (theme.dark ? this.darkId : this.lightId);
  }

  /** While following the OS, a theme becomes the light or dark one (by its kind); otherwise the fixed one. */
  select(id: string): void {
    const theme = this.all.find((t) => t.id === id);
    if (!theme) return;
    if (this.followSystem) {
      if (theme.dark) this.darkId = id;
      else this.lightId = id;
    } else {
      this.fixedId = id;
    }
    this.save();
  }

  toggleFollowSystem(): void {
    if (this.followSystem) this.fixedId = this.activeId;
    this.followSystem = !this.followSystem;
    this.save();
  }

  openFolder(): void {
    void this.api?.openFolder();
  }

  private save(): void {
    const value: ThemePrefs = {
      followSystem: this.followSystem,
      light: this.lightId,
      dark: this.darkId,
      fixed: this.fixedId,
    };
    this.prefs.set('theme', value);
  }
}
