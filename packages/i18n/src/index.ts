import en from './locales/en.json';
import it from './locales/it.json';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

const catalogs = { en, it } satisfies Record<string, Messages>;

export type Locale = keyof typeof catalogs;
export const locales = Object.keys(catalogs) as Locale[];
export const fallbackLocale: Locale = 'en';

/** Picks the best supported locale from a list of BCP 47 tags (e.g. `navigator.languages`). */
export function negotiateLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base && base in catalogs) return base as Locale;
  }
  return fallbackLocale;
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export function createTranslator(locale: Locale): Translate {
  const messages: Messages = catalogs[locale];
  const fallback: Messages = catalogs[fallbackLocale];
  return (key, params) => {
    const template = messages[key] ?? fallback[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}
