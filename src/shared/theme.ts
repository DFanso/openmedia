import { useEffect } from "react";
import type { Theme } from "./ipc";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(preference: Theme, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

/** Keeps `<html data-theme>` in step with the preference and, for "system", the OS setting. */
export function useApplyTheme(preference: Theme) {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference, query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [preference]);
}
