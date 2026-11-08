import { useState } from "react";
import { useApp } from "../../app/store";
import { LOCALES_BY_NAME } from "../../i18n/locales";
import type { MessageKey } from "../../i18n/messages";
import { useT } from "../../i18n/useT";
import { Screen } from "../../shared/Screen";
import type { Theme } from "../../shared/ipc";
import { AiSection } from "./AiSection";
import { FavoritesSection } from "./FavoritesSection";
import { MarginSlider } from "./MarginSlider";
import { PremadeRecipesSection } from "./PremadeRecipesSection";
import { Switch } from "./Switch";
import { Group, Section, field, primaryButton, quietButton } from "./ui";

export function SettingsScreen() {
  const open = useApp((s) => s.sheet === "settings");
  const closeSheet = useApp((s) => s.closeSheet);
  const t = useT();
  if (!open) return null;

  return (
    <Screen title={t("settings.title")} closeLabel={t("settings.close")} onClose={closeSheet}>
      <div className="flex flex-col gap-9">
        <AppearanceSection />
        <LanguageSection />
        <BrowsingSection />
        <PremadeRecipesSection />
        <FavoritesSection />
        <AiSection />
        <DataSection />
      </div>
    </Screen>
  );
}

const THEMES: { value: Theme; label: MessageKey }[] = [
  { value: "system", label: "settings.themeSystem" },
  { value: "light", label: "settings.themeLight" },
  { value: "dark", label: "settings.themeDark" },
];

function AppearanceSection() {
  const theme = useApp((s) => s.state?.theme ?? "system");
  const setTheme = useApp((s) => s.setTheme);
  const t = useT();

  return (
    <Section title={t("settings.appearance")} note={t("settings.appearanceNote")}>
      <div
        role="radiogroup"
        aria-label={t("settings.themeLabel")}
        className="grid grid-cols-3 gap-1 rounded-2xl border border-hair bg-paper/[0.04] p-1"
      >
        {THEMES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            onClick={() => void setTheme(option.value)}
            className={`rounded-xl py-2.5 text-sm font-medium ${
              theme === option.value ? "bg-accent text-on-accent" : "text-paper/75"
            }`}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </Section>
  );
}

/** The language of the app's text. An empty choice means the device's own language. */
function LanguageSection() {
  const locale = useApp((s) => s.state?.locale ?? null);
  const setLocale = useApp((s) => s.setLocale);
  const t = useT();

  return (
    <Section title={t("settings.language")} note={t("settings.languageNote")}>
      <Group>
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <label className="text-xs text-paper/60" htmlFor="app-language">
            {t("settings.languageLabel")}
          </label>
          <select
            id="app-language"
            className={field}
            value={locale ?? ""}
            onChange={(event) => void setLocale(event.target.value || null)}
          >
            <option value="">{t("settings.languageSystem")}</option>
            {LOCALES_BY_NAME.map((entry) => (
              <option key={entry.tag} value={entry.tag}>
                {entry.nativeName}
              </option>
            ))}
          </select>
        </div>
      </Group>
    </Section>
  );
}

function BrowsingSection() {
  const adBlock = useApp((s) => s.state?.adBlock ?? true);
  const backButton = useApp((s) => s.state?.backButton ?? false);
  const margin = useApp((s) => s.state?.bottomMargin ?? 0);
  const setAdBlock = useApp((s) => s.setAdBlock);
  const setBackButton = useApp((s) => s.setBackButton);
  const setBottomMargin = useApp((s) => s.setBottomMargin);
  const t = useT();

  return (
    <Section title={t("settings.browsing")} note={t("settings.browsingNote")}>
      <Group>
        <Switch
          label={t("settings.adBlock")}
          checked={adBlock}
          onChange={(on) => void setAdBlock(on)}
        />
        <Switch
          label={t("settings.backButton")}
          description={t("settings.backButtonNote")}
          checked={backButton}
          onChange={(on) => void setBackButton(on)}
        />
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div>
            <div className="text-base">{t("settings.bottomMargin")}</div>
            <div className="mt-0.5 text-sm leading-snug text-paper/55">
              {t("settings.bottomMarginNote")}
            </div>
          </div>
          <MarginSlider
            label={t("settings.bottomMarginLabel")}
            value={margin}
            onCommit={(pixels) => void setBottomMargin(pixels)}
          />
        </div>
      </Group>
    </Section>
  );
}

function DataSection() {
  const count = useApp((s) => s.state?.history.length ?? 0);
  const clearHistory = useApp((s) => s.clearHistory);
  const resetGuide = useApp((s) => s.resetGuide);
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  return (
    <Section title={t("settings.data")} note={t("settings.dataNote")}>
      <Group>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-base">{t("settings.history")}</div>
            <div className="text-sm text-paper/55">
              {count === 0 ? t("settings.historyEmpty") : t("settings.historyCount", { count })}
            </div>
          </div>
          {confirming ? (
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setConfirming(false)} className={quietButton}>
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  void clearHistory();
                }}
                className={primaryButton}
              >
                {t("settings.clearHistoryCount", { count })}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={count === 0}
              onClick={() => setConfirming(true)}
              className={quietButton}
            >
              {t("settings.clearHistory")}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-base">{t("settings.guide")}</div>
            <div className="text-sm text-paper/55">{t("settings.guideNote")}</div>
          </div>
          <button type="button" onClick={() => void resetGuide()} className={quietButton}>
            {t("settings.replay")}
          </button>
        </div>
      </Group>
    </Section>
  );
}
