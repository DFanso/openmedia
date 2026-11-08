/**
 * The languages the app ships with.
 *
 * `tag` is a BCP 47 language tag. The shell uses it to pick a message catalog, to set the page's
 * `lang` and `dir`, and to tell `Intl.PluralRules` which plural rules to use.
 *
 * `pluralForms` lists the plural categories this language uses, in the order its message file
 * writes the forms of a plural message. A count picks the form whose category
 * `Intl.PluralRules` returns; a category that is not listed falls back to the last form, which is
 * what happens when a newer ICU adds one.
 */
export interface LocaleInfo {
  tag: string;
  /** The language's own name, as its speakers write it. */
  nativeName: string;
  /** English name, for the wiki and for searching the picker. */
  englishName: string;
  dir: "ltr" | "rtl";
  pluralForms: readonly string[];
}

export const LOCALES = [
  {
    tag: "en",
    nativeName: "English",
    englishName: "English",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "de",
    nativeName: "Deutsch",
    englishName: "German",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "fr",
    nativeName: "Français",
    englishName: "French",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "es",
    nativeName: "Español",
    englishName: "Spanish",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "pt",
    nativeName: "Português",
    englishName: "Portuguese",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "it",
    nativeName: "Italiano",
    englishName: "Italian",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "nl",
    nativeName: "Nederlands",
    englishName: "Dutch",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "sv",
    nativeName: "Svenska",
    englishName: "Swedish",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "pl",
    nativeName: "Polski",
    englishName: "Polish",
    dir: "ltr",
    pluralForms: ["one", "few", "many", "other"],
  },
  {
    tag: "cs",
    nativeName: "Čeština",
    englishName: "Czech",
    dir: "ltr",
    pluralForms: ["one", "few", "many", "other"],
  },
  {
    tag: "ro",
    nativeName: "Română",
    englishName: "Romanian",
    dir: "ltr",
    pluralForms: ["one", "few", "other"],
  },
  {
    tag: "el",
    nativeName: "Ελληνικά",
    englishName: "Greek",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    dir: "ltr",
    pluralForms: ["one", "few", "many", "other"],
  },
  {
    tag: "uk",
    nativeName: "Українська",
    englishName: "Ukrainian",
    dir: "ltr",
    pluralForms: ["one", "few", "many", "other"],
  },
  {
    tag: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    dir: "rtl",
    pluralForms: ["zero", "one", "two", "few", "many", "other"],
  },
  {
    tag: "ur",
    nativeName: "اردو",
    englishName: "Urdu",
    dir: "rtl",
    pluralForms: ["zero", "one", "two", "few", "many", "other"],
  },
  {
    tag: "zh-Hans",
    nativeName: "简体中文",
    englishName: "Chinese (Simplified)",
    dir: "ltr",
    pluralForms: ["other"],
  },
  {
    tag: "zh-Hant",
    nativeName: "繁體中文",
    englishName: "Chinese (Traditional)",
    dir: "ltr",
    pluralForms: ["other"],
  },
  { tag: "ja", nativeName: "日本語", englishName: "Japanese", dir: "ltr", pluralForms: ["other"] },
  { tag: "ko", nativeName: "한국어", englishName: "Korean", dir: "ltr", pluralForms: ["other"] },
  { tag: "th", nativeName: "ไทย", englishName: "Thai", dir: "ltr", pluralForms: ["other"] },
  {
    tag: "vi",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    dir: "ltr",
    pluralForms: ["other"],
  },
  {
    tag: "id",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    dir: "ltr",
    pluralForms: ["other"],
  },
  {
    tag: "ms",
    nativeName: "Bahasa Melayu",
    englishName: "Malay",
    dir: "ltr",
    pluralForms: ["other"],
  },
  {
    tag: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "bn",
    nativeName: "বাংলা",
    englishName: "Bengali",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "ta",
    nativeName: "தமிழ்",
    englishName: "Tamil",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
  {
    tag: "si",
    nativeName: "සිංහල",
    englishName: "Sinhala",
    dir: "ltr",
    pluralForms: ["one", "other"],
  },
] as const satisfies readonly LocaleInfo[];

export type Locale = (typeof LOCALES)[number]["tag"];

const BY_TAG = new Map<string, Locale>(
  LOCALES.map((locale) => [locale.tag.toLowerCase(), locale.tag]),
);

/** The languages the app ships with, ordered the way the device's language sorts them. */
export const LOCALES_BY_NAME: readonly LocaleInfo[] = [...LOCALES].sort((a, b) =>
  new Intl.Collator().compare(a.nativeName, b.nativeName),
);

export function localeInfo(tag: Locale): LocaleInfo {
  const found = LOCALES.find((locale) => locale.tag === tag);
  if (!found) throw new Error(`unknown locale: ${tag}`);
  return found;
}

/**
 * The locale that matches a language tag: exactly, or by its base language. `zh` picks Simplified
 * unless the tag names a Traditional region or script. `null` means the tag is not one we ship.
 */
export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const wanted = tag.toLowerCase();
  const exact = BY_TAG.get(wanted);
  if (exact) return exact;
  const [base, ...rest] = wanted.split("-");
  if (base === "zh") {
    const traditional = rest.some((part) => ["hant", "tw", "hk", "mo"].includes(part));
    return traditional ? "zh-Hant" : "zh-Hans";
  }
  for (const locale of LOCALES) {
    if (locale.tag.toLowerCase().split("-")[0] === base) return locale.tag;
  }
  return null;
}

/** The language the device is set to, as a BCP 47 tag. */
export function deviceLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.languages?.[0] ?? navigator.language ?? "en";
}

/** The locale to use when the user has not chosen one: the device's, or English. */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages?.length ? navigator.languages : [deviceLanguage()];
  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate);
    if (resolved) return resolved;
  }
  return "en";
}
