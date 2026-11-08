import { useMemo } from "react";
import { selectLocale, useApp } from "../app/store";
import { createTranslator, type Translate } from "./translate";

/** The translator for the language the app is in. It changes when the user picks another one. */
export function useT(): Translate {
  const locale = useApp(selectLocale);
  return useMemo(() => createTranslator(locale), [locale]);
}
