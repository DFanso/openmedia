import { hideSplash, hideSplashWhen } from "./splash";
import { useEffect } from "react";
import { BackButton } from "../features/back/BackButton";
import { Fab } from "../features/fab/Fab";
import { Onboarding } from "../features/onboarding/Onboarding";
import { CommandBar } from "../features/sheet/CommandBar";
import { HistorySheet } from "../features/history/HistorySheet";
import { StatsSheet } from "../features/stats/StatsSheet";
import { startUsageTracking } from "../features/stats/tracker";
import { SettingsScreen } from "../features/settings/SettingsScreen";
import { WebLayer } from "../features/web/WebLayer";
import { useApplyTheme } from "../shared/theme";
import { useApp } from "./store";
import { useHitRegions } from "./useHitRegions";

/** True with no page to wait for, or once the visible page has reported an address. */
function activePageHasUrl(): boolean {
  const { activeId, sessions } = useApp.getState();
  return activeId === null || sessions.some((s) => s.id === activeId && s.url !== null);
}

export function App() {
  const load = useApp((s) => s.load);
  const error = useApp((s) => s.error);
  const sheet = useApp((s) => s.sheet);
  const reportError = useApp((s) => s.reportError);
  const theme = useApp((s) => s.state?.theme ?? "system");
  useApplyTheme(theme);
  useHitRegions();

  useEffect(() => startUsageTracking(), []);

  useEffect(() => {
    void load().then(() => hideSplashWhen(activePageHasUrl, useApp.subscribe), hideSplash);
  }, [load]);

  return (
    <>
      <WebLayer />
      <Fab />
      <BackButton />
      <CommandBar />
      <SettingsScreen />
      <HistorySheet />
      <StatsSheet />
      <Onboarding />
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
