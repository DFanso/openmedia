import { CATALOG } from "./catalog";
import { localeInfo, type Locale } from "./locales";
import type { MessageKey } from "./messages";

export type TranslateParams = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: TranslateParams) => string;

/** The parts of a plural message, one per plural category the language uses. */
const PLURAL_SEPARATOR = " | ";
const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(template: string, params: TranslateParams): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * The translator for one language. A missing key falls back to English, so a half-finished
 * language shows English rather than a raw key.
 */
export function createTranslator(locale: Locale): Translate {
  const messages = CATALOG[locale];
  const forms = localeInfo(locale).pluralForms;
  const rules = new Intl.PluralRules(locale);

  return (key, params) => {
    const template = messages[key] ?? CATALOG.en[key] ?? key;
    const count = params?.count;
    if (count === undefined || !template.includes(PLURAL_SEPARATOR)) {
      return interpolate(template, params ?? {});
    }

    const options = template.split(PLURAL_SEPARATOR);
    const value = Number(count);
    if (!Number.isFinite(value)) return interpolate(options[0], params ?? {});

    const category = rules.select(value);
    const index = forms.indexOf(category);
    // A category the language does not list (a newer ICU adds one) falls back to the last form.
    const chosen =
      index >= 0 && index < options.length ? options[index] : options[options.length - 1];
    return interpolate(chosen, params ?? {});
  };
}
