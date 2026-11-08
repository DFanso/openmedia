import { ar } from "./locales/ar";
import { bn } from "./locales/bn";
import { cs } from "./locales/cs";
import { de } from "./locales/de";
import { el } from "./locales/el";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { hi } from "./locales/hi";
import { id } from "./locales/id";
import { it } from "./locales/it";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { ms } from "./locales/ms";
import { nl } from "./locales/nl";
import { pl } from "./locales/pl";
import { pt } from "./locales/pt";
import { ro } from "./locales/ro";
import { ru } from "./locales/ru";
import { si } from "./locales/si";
import { sv } from "./locales/sv";
import { ta } from "./locales/ta";
import { th } from "./locales/th";
import { tr } from "./locales/tr";
import { uk } from "./locales/uk";
import { ur } from "./locales/ur";
import { vi } from "./locales/vi";
import { zhHant } from "./locales/zh-Hant";
import { zhHans } from "./locales/zh-Hans";
import type { Locale } from "./locales";
import type { Messages } from "./messages";

/** Every language's messages, keyed by its tag. */
export const CATALOG: Record<Locale, Messages> = {
  en,
  de,
  fr,
  es,
  pt,
  it,
  nl,
  sv,
  pl,
  cs,
  ro,
  el,
  ru,
  uk,
  tr,
  ar,
  ur,
  "zh-Hans": zhHans,
  "zh-Hant": zhHant,
  ja,
  ko,
  th,
  vi,
  id,
  ms,
  hi,
  bn,
  ta,
  si,
};
