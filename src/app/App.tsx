import { lazy, Suspense, useEffect, useState } from "react";
import { BackButton } from "../features/back/BackButton";
import { Fab } from "../features/fab/Fab";
import { CommandBar } from "../features/sheet/CommandBar";
import { HistorySheet } from "../features/history/HistorySheet";
import { startUsageTracking } from "../features/stats/tracker";
import { WebLayer } from "../features/web/WebLayer";
import { useApplyTheme } from "../shared/theme";
import { hideSplash, hideSplashWhen, pageShowing } from "./splash";
import { selectPage, useApp } from "./store";
import { useHitRegions } from "./useHitRegions";

/** Heavy screens load after the first page shows; most launches never open them. */
const loadSettings = () => import("../features/settings/SettingsScreen");
const loadStats = () => import("../features/stats/StatsSheet");
const loadOnboarding = () => import("../features/onboarding/Onboarding");
const SettingsScreen = lazy(() =>
  loadSettings().then((module) => ({ default: module.SettingsScreen })),
);
const StatsSheet = lazy(() => loadStats().then((module) => ({ default: module.StatsSheet })));
const Onboarding = lazy(() => loadOnboarding().then((module) => ({ default: module.Onboarding })));

function firstPageShowing(): boolean {
  const store = useApp.getState();
  return store.error !== null || pageShowing(selectPage(store));
}

export function App() {
  const load = useApp((s) => s.load);
  const loadSecondary = useApp((s) => s.loadSecondary);
  const error = useApp((s) => s.error);
  const sheet = useApp((s) => s.sheet);
  const onboardingOpen = useApp((s) => s.onboardingOpen);
  const reportError = useApp((s) => s.reportError);
  const theme = useApp((s) => s.state?.theme ?? "system");
  const [idle, setIdle] = useState(false);
  useApplyTheme(theme);
  useHitRegions();

  useEffect(() => startUsageTracking(), []);

  useEffect(() => {
    void load()
      .then(() => hideSplashWhen(firstPageShowing, useApp.subscribe), hideSplash)
      .then(() => {
        loadSecondary();
        void Promise.all([loadSettings(), loadStats()]);
        setIdle(true);
      });
  }, [load, loadSecondary]);

  return (
    <>
      <WebLayer />
      <Fab />
      <BackButton />
      <CommandBar />
      <HistorySheet />
      <Suspense fallback={null}>
        {(idle || sheet === "settings") && <SettingsScreen />}
        {(idle || sheet === "stats") && <StatsSheet />}
        {onboardingOpen && <Onboarding />}
      </Suspense>
      {error && sheet !== "settings" && (
        <button
          type="button"
          data-hit=""
          onClick={() => reportError(null)}
          className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-20 rounded-2xl px-4 py-3 text-left text-sm text-accent"
        >
          {error}
          <span className="mt-1 block text-xs text-paper/50">Tap to dismiss</span>
        </button>
      )}
    </>
  );
}
