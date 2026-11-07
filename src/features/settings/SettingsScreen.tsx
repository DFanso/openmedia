import { useState } from "react";
import { useApp } from "../../app/store";
import { Screen } from "../../shared/Screen";
import type { Theme } from "../../shared/ipc";
import { AiSection } from "./AiSection";
import { FavoritesSection } from "./FavoritesSection";
import { MarginSlider } from "./MarginSlider";
import { PremadeRecipesSection } from "./PremadeRecipesSection";
import { Switch } from "./Switch";
import { Group, Section, primaryButton, quietButton } from "./ui";

export function SettingsScreen() {
  const open = useApp((s) => s.sheet === "settings");
  const closeSheet = useApp((s) => s.closeSheet);
  if (!open) return null;

  return (
    <Screen title="Settings" closeLabel="Close settings" onClose={closeSheet}>
      <div className="flex flex-col gap-9">
        <AppearanceSection />
        <BrowsingSection />
        <PremadeRecipesSection />
        <FavoritesSection />
        <AiSection />
        <DataSection />
      </div>
    </Screen>
  );
}

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceSection() {
  const theme = useApp((s) => s.state?.theme ?? "system");
  const setTheme = useApp((s) => s.setTheme);

  return (
    <Section
      title="Appearance"
      note="Applies to the app, and to sites that follow the system color scheme."
    >
      <div
        role="radiogroup"
        aria-label="Theme"
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
            {option.label}
          </button>
        ))}
      </div>
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

  return (
    <Section
      title="Browsing"
      note="Ad blocking uses lists built into the app; if a site stops working, turn it off and the page reloads. The back button sits opposite the main button, for sites with none of their own. A pre-made recipe can set its own bottom margin."
    >
      <Group>
        <Switch
          label="Block ads and trackers"
          checked={adBlock}
          onChange={(on) => void setAdBlock(on)}
        />
        <Switch
          label="Floating back button"
          description="Shown whenever the page has somewhere to go back to."
          checked={backButton}
          onChange={(on) => void setBackButton(on)}
        />
        <div className="flex flex-col gap-2 px-4 py-3.5">
          <div>
            <div className="text-base">Bottom margin</div>
            <div className="mt-0.5 text-sm leading-snug text-paper/55">
              Keeps the bottom of every page clear, for menus that slide under the screen edge.
            </div>
          </div>
          <MarginSlider
            label="Bottom margin for all sites"
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

  return (
    <Section
      title="Data and help"
      note="History is the addresses you have searched, kept on this device only. Clearing it also forgets the last page, so the app starts on your first favorite. Open pages, favorites and logins stay."
    >
      <Group>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-base">History</div>
            <div className="text-sm text-paper/55">
              {count === 0 ? "Empty" : `${count} ${count === 1 ? "site" : "sites"}`}
            </div>
          </div>
          {confirming ? (
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => setConfirming(false)} className={quietButton}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  void clearHistory();
                }}
                className={primaryButton}
              >
                Clear {count}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={count === 0}
              onClick={() => setConfirming(true)}
              className={quietButton}
            >
              Clear history
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-base">First-run guide</div>
            <div className="text-sm text-paper/55">Marks it unseen and shows it again now.</div>
          </div>
          <button type="button" onClick={() => void resetGuide()} className={quietButton}>
            Replay
          </button>
        </div>
      </Group>
    </Section>
  );
}
