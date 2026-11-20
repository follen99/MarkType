/**
 * Settings that are not owned by another store (workspace: autosave, images; themes: theme choice).
 * All of them live in `platform.prefs` (settings.json on desktop, docs/SPEC.md §16).
 */
import type { PandocFormat, PrefsApi } from '@marktype/platform';

export type ExportFormat = 'html' | 'pdf' | PandocFormat;

export type LanguageSetting = 'auto' | 'it' | 'en';

export interface ExportSettings {
  /** Images inside the HTML file (base64) instead of relative paths. */
  embedImages: boolean;
  /** Pandoc program; empty = `pandoc` from PATH. */
  pandocPath: string;
  /** PDF: title, date and page numbers at the top and bottom of each page. */
  pdfHeaderFooter: boolean;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  embedImages: false,
  pandocPath: '',
  pdfHeaderFooter: false,
};

/** `null` = what the theme says. */
export const FONT_SIZES = [null, 13, 14, 15, 16, 17, 18, 20, 22] as const;
/** `null` = what the theme says; 0 = the whole window. */
export const PAGE_WIDTHS = [null, 700, 860, 1000, 1200, 0] as const;

const LANGUAGES: readonly LanguageSetting[] = ['auto', 'it', 'en'];

const isNumberOrNull = (value: unknown, allowed: readonly (number | null)[]): value is number | null =>
  allowed.includes(value as number | null);

export function loadExportSettings(prefs: PrefsApi): ExportSettings {
  const stored = prefs.get<Partial<ExportSettings>>('export', {});
  return {
    embedImages: stored.embedImages === true,
    pandocPath: typeof stored.pandocPath === 'string' ? stored.pandocPath : '',
    pdfHeaderFooter: stored.pdfHeaderFooter === true,
  };
}

export function loadLanguage(prefs: PrefsApi): LanguageSetting {
  const value = prefs.get<string>('language', 'auto');
  return LANGUAGES.includes(value as LanguageSetting) ? (value as LanguageSetting) : 'auto';
}

/** CSS overriding the theme's font size and page width (empty when both follow the theme). */
export function layoutCss(fontSize: number | null, pageWidth: number | null): string {
  const rules: string[] = [];
  if (fontSize)
    rules.push(`:root { --base-font-size: ${fontSize}px; }`, `#write { font-size: ${fontSize}px; }`);
  if (pageWidth !== null) rules.push(`#write { max-width: ${pageWidth ? `${pageWidth}px` : 'none'}; }`);
  return rules.join('\n');
}

const LAYOUT_STYLE_ID = 'mt-user-layout';

export class AppSettings {
  language = $state<LanguageSetting>('auto');
  /** Reopen the last folder at startup. */
  restoreFolder = $state(true);
  /** GPU rendering (Windows; read by the Rust side at startup, applies after a restart). */
  hardwareAcceleration = $state(true);
  fontSize = $state<number | null>(null);
  pageWidth = $state<number | null>(null);
  exportSettings = $state<ExportSettings>(DEFAULT_EXPORT_SETTINGS);

  constructor(private readonly prefs: PrefsApi) {
    this.language = loadLanguage(prefs);
    this.restoreFolder = prefs.get<unknown>('restoreFolder', true) !== false;
    this.hardwareAcceleration = prefs.get<unknown>('hardwareAcceleration', true) !== false;
    const editor = prefs.get<{ fontSize?: unknown; pageWidth?: unknown }>('editor', {});
    this.fontSize = isNumberOrNull(editor.fontSize, FONT_SIZES) ? editor.fontSize : null;
    this.pageWidth = isNumberOrNull(editor.pageWidth, PAGE_WIDTHS) ? editor.pageWidth : null;
    this.exportSettings = loadExportSettings(prefs);
  }

  setLanguage(language: LanguageSetting): void {
    this.language = language;
    this.prefs.set('language', language);
  }

  setRestoreFolder(value: boolean): void {
    this.restoreFolder = value;
    this.prefs.set('restoreFolder', value);
  }

  setHardwareAcceleration(value: boolean): void {
    this.hardwareAcceleration = value;
    this.prefs.set('hardwareAcceleration', value);
  }

  setLayout(patch: { fontSize?: number | null; pageWidth?: number | null }): void {
    if ('fontSize' in patch) this.fontSize = patch.fontSize ?? null;
    if ('pageWidth' in patch) this.pageWidth = patch.pageWidth ?? null;
    this.prefs.set('editor', { fontSize: this.fontSize, pageWidth: this.pageWidth });
    this.applyLayout();
  }

  setExport(patch: Partial<ExportSettings>): void {
    this.exportSettings = { ...this.exportSettings, ...patch };
    this.prefs.set('export', $state.snapshot(this.exportSettings));
  }

  /** Puts the font size / page width rules after the theme (a `<style>` at the end of `<body>` wins). */
  applyLayout(): void {
    let style = document.getElementById(LAYOUT_STYLE_ID) as HTMLStyleElement | null;
    const css = layoutCss(this.fontSize, this.pageWidth);
    if (!css) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement('style');
      style.id = LAYOUT_STYLE_ID;
      document.body.appendChild(style);
    }
    style.textContent = css;
  }
}
