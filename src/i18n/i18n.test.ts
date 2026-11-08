import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { LOCALES, resolveLocale } from "./locales";
import { createTranslator } from "./translate";

const SEPARATOR = " | ";
const placeholdersOf = (text: string) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();

describe("catalog", () => {
  const keys = Object.keys(CATALOG.en);

  for (const locale of LOCALES) {
    it(`${locale.tag} has the English keys, placeholders and plural forms`, () => {
      const messages = CATALOG[locale.tag] as Record<string, string>;
      expect(Object.keys(messages).sort()).toEqual([...keys].sort());
      for (const key of keys) {
        const english = (CATALOG.en as Record<string, string>)[key];
        const forms = messages[key].split(SEPARATOR);
        const isPlural = english.includes(SEPARATOR);
        expect(forms.length, key).toBe(isPlural ? locale.pluralForms.length : 1);
        for (const form of forms) {
          expect(placeholdersOf(form), key).toEqual(
            isPlural ? placeholdersOf(forms.join(" ")) : placeholdersOf(english),
          );
        }
        if (isPlural)
          expect(
            forms.every((form) => form.includes("{count}")),
            key,
          ).toBe(true);
      }
    });
  }
});

describe("createTranslator", () => {
  it("fills placeholders", () => {
    expect(createTranslator("en")("fab.openFavorite", { name: "Reddit" })).toBe("Open Reddit");
  });

  it("picks the plural form for the count", () => {
    const en = createTranslator("en");
    expect(en("settings.historyCount", { count: 1 })).toBe("1 site");
    expect(en("settings.historyCount", { count: 3 })).toBe("3 sites");
    const ru = createTranslator("ru");
    const forms = (n: number) => ru("settings.historyCount", { count: n });
    expect(new Set([forms(1), forms(2), forms(5)]).size).toBe(3);
    expect(forms(21)).toBe(forms(1).replace("1", "21"));
  });
});

describe("resolveLocale", () => {
  it("matches exact tags and base languages", () => {
    expect(resolveLocale("si")).toBe("si");
    expect(resolveLocale("de-AT")).toBe("de");
    expect(resolveLocale("pt-BR")).toBe("pt");
  });

  it("splits Chinese by script or region", () => {
    expect(resolveLocale("zh-CN")).toBe("zh-Hans");
    expect(resolveLocale("zh-TW")).toBe("zh-Hant");
    expect(resolveLocale("zh-Hant-HK")).toBe("zh-Hant");
  });

  it("returns null for languages that are not shipped", () => {
    expect(resolveLocale("xx")).toBeNull();
    expect(resolveLocale(null)).toBeNull();
  });
});
