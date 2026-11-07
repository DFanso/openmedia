import { useState } from "react";
import { useApp } from "../../app/store";
import { CloseIcon, DownIcon, PlusIcon, UpIcon } from "../../shared/icons";
import type { Theme } from "../../shared/ipc";
import { normalizeWebUrl } from "../../shared/url";
import { AiSection } from "./AiSection";
import { MarginSlider } from "./MarginSlider";
import { MAX_FAVORITE_NAME, MAX_FAVORITES } from "./presets";
import { PlatformCatalog } from "./PlatformCatalog";
import { isPlatformUrl } from "./platforms";
import { SitesSection } from "./SitesSection";
import { Switch } from "./Switch";

const field =
  "w-full min-w-0 rounded-xl border border-hair bg-paper/[0.05] px-3 py-2.5 text-base text-paper outline-none placeholder:text-paper/35 focus:border-accent";

/** Full-screen so nothing from the page shows through while editing. */
export function SettingsScreen() {
  const open = useApp((s) => s.sheet === "settings");
  const closeSheet = useApp((s) => s.closeSheet);
  if (!open) return null;

  return (
    <div data-hit="" className="fixed inset-0 z-50 flex flex-col bg-ink">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
        <h1 className="text-xs font-medium tracking-[0.22em] text-paper/60 uppercase">Settings</h1>
        <button
          type="button"
          aria-label="Close settings"
          onClick={closeSheet}
          className="grid size-11 place-items-center rounded-full text-paper/80"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-12 overflow-y-auto px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+32px)]">
        <AppearanceSection />
        <BlockingSection />
        <SitesSection />
        <MarginSection />
        <BackButtonSection />
        <FavoritesSection />
        <HistorySection />
        <AiSection />
        <GuideSection />
      </div>
    </div>
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
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Appearance</h2>
      <p className="mt-1 text-sm text-paper/55">
        Applies to the app, and to sites that follow the system color scheme.
      </p>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-hair p-1"
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
    </section>
  );
}

function BlockingSection() {
  const enabled = useApp((s) => s.state?.adBlock ?? true);
  const setAdBlock = useApp((s) => s.setAdBlock);

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Ad blocking</h2>
      <p className="mt-1 text-sm text-paper/55">
        Blocks ads and trackers before they load, using lists built into the app. If a site stops
        working, turn it off; the page reloads.
      </p>
      <div className="mt-4">
        <Switch
          label="Block ads and trackers"
          checked={enabled}
          onChange={(on) => void setAdBlock(on)}
        />
      </div>
    </section>
  );
}

function MarginSection() {
  const margin = useApp((s) => s.state?.bottomMargin ?? 0);
  const setBottomMargin = useApp((s) => s.setBottomMargin);

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Bottom margin</h2>
      <p className="mt-1 text-sm text-paper/55">
        Keeps the bottom of every page clear, for sites whose menus slide under the screen edge. A
        site can have its own margin under Sites.
      </p>
      <div className="mt-4 rounded-2xl border border-hair px-4 py-3">
        <MarginSlider
          label="Bottom margin for all sites"
          value={margin}
          onCommit={(pixels) => void setBottomMargin(pixels)}
        />
      </div>
    </section>
  );
}

function BackButtonSection() {
  const enabled = useApp((s) => s.state?.backButton ?? false);
  const setBackButton = useApp((s) => s.setBackButton);

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Back button</h2>
      <p className="mt-1 text-sm text-paper/55">
        Shows a floating button on the side opposite the main button whenever the page has somewhere
        to go back to. For sites that have no back button of their own.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => void setBackButton(!enabled)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-hair px-4 py-3 text-base"
      >
        <span>Show floating back button</span>
        <span
          aria-hidden="true"
          className={`relative h-7 w-12 rounded-full transition-colors ${
            enabled ? "bg-accent" : "bg-paper/20"
          }`}
        >
          <span
            className={`absolute top-0.5 size-6 rounded-full transition-all ${
              enabled ? "left-[22px] bg-on-accent" : "left-0.5 bg-paper/70"
            }`}
          />
        </span>
      </button>
    </section>
  );
}

interface Draft {
  key: string;
  name: string;
  url: string;
}

let draftCounter = 0;
const newKey = () => `draft-${++draftCounter}`;

function FavoritesSection() {
  const favorites = useApp((s) => s.state?.favorites);
  const saveFavorites = useApp((s) => s.saveFavorites);
  const serverError = useApp((s) => s.error);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    (favorites ?? []).map((f) => ({ key: f.id, name: f.name, url: f.url })),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = (key: string, patch: Partial<Draft>) => {
    setProblem(null);
    setSaved(false);
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const move = (index: number, by: -1 | 1) => {
    setSaved(false);
    setDrafts((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  };

  const save = async () => {
    const cleaned: Draft[] = [];
    for (const draft of drafts) {
      const url = normalizeWebUrl(draft.url);
      if (!draft.name.trim() || !url) {
        setProblem("Every favorite needs a name and a valid address.");
        return;
      }
      cleaned.push({ ...draft, url });
    }
    setSaved(await saveFavorites(cleaned.map(({ name, url }) => ({ name, url }))));
  };

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Favorites</h2>
      <p className="mt-1 text-sm text-paper/55">
        Shown when you hold the button. Up to {MAX_FAVORITES}.
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {drafts.map((draft, index) => (
          <li key={draft.key} className="flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                aria-label={`Favorite ${index + 1} name`}
                className={field}
                maxLength={MAX_FAVORITE_NAME}
                placeholder="Name"
                value={draft.name}
                onChange={(e) => update(draft.key, { name: e.target.value })}
              />
              <input
                aria-label={`Favorite ${index + 1} address`}
                className={field}
                autoCapitalize="none"
                autoCorrect="off"
                inputMode="url"
                placeholder="example.com"
                value={draft.url}
                onChange={(e) => update(draft.key, { url: e.target.value })}
              />
            </div>
            <div className="flex flex-col justify-between">
              <button
                type="button"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="grid size-9 place-items-center text-paper/70 disabled:opacity-20"
              >
                <UpIcon />
              </button>
              <button
                type="button"
                aria-label={`Remove ${draft.name || "favorite"}`}
                onClick={() => setDrafts((l) => l.filter((d) => d.key !== draft.key))}
                className="grid size-9 place-items-center text-paper/70"
              >
                <CloseIcon />
              </button>
              <button
                type="button"
                aria-label="Move down"
                disabled={index === drafts.length - 1}
                onClick={() => move(index, 1)}
                className="grid size-9 place-items-center text-paper/70 disabled:opacity-20"
              >
                <DownIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={drafts.length >= MAX_FAVORITES}
        onClick={() => setDrafts((l) => [...l, { key: newKey(), name: "", url: "" }])}
        className="mt-4 flex items-center gap-2 text-sm font-medium text-accent disabled:opacity-30"
      >
        <PlusIcon /> Add favorite
      </button>

      {(problem ?? serverError) && (
        <p className="mt-3 text-sm text-accent">{problem ?? serverError}</p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent"
        >
          Save favorites
        </button>
        {saved && <span className="text-sm text-paper/60">Saved</span>}
      </div>

      <PlatformCatalog
        urls={drafts.map((d) => d.url)}
        full={drafts.length >= MAX_FAVORITES}
        onAdd={(platform) => {
          setProblem(null);
          setSaved(false);
          setDrafts((l) => [...l, { key: newKey(), name: platform.name, url: platform.url }]);
        }}
        onRemove={(platform) => {
          setSaved(false);
          setDrafts((l) => l.filter((d) => !isPlatformUrl(platform, d.url)));
        }}
      />
    </section>
  );
}

function HistorySection() {
  const count = useApp((s) => s.state?.history.length ?? 0);
  const clearHistory = useApp((s) => s.clearHistory);
  const [confirming, setConfirming] = useState(false);

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">History</h2>
      <p className="mt-1 text-sm text-paper/55">
        The addresses you have searched, kept on this device only. Clearing also forgets the last
        page, so the app starts on your first favorite. Open pages, favorites and logins stay.
      </p>
      {confirming ? (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              void clearHistory();
            }}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent"
          >
            Clear {count} {count === 1 ? "site" : "sites"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-full border border-hair px-5 py-2.5 text-sm font-medium text-paper/85"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={count === 0}
          onClick={() => setConfirming(true)}
          className="mt-3 rounded-full border border-hair px-5 py-2.5 text-sm font-medium text-paper/85 disabled:opacity-30"
        >
          Clear history
        </button>
      )}
    </section>
  );
}

function GuideSection() {
  const resetGuide = useApp((s) => s.resetGuide);

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Guide</h2>
      <p className="mt-1 text-sm text-paper/55">
        Marks the first-run guide as unseen and shows it again now.
      </p>
      <button
        type="button"
        onClick={() => void resetGuide()}
        className="mt-3 rounded-full border border-hair px-5 py-2.5 text-sm font-medium text-paper/85"
      >
        Reset onboarding
      </button>
    </section>
  );
}
