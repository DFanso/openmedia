import { create } from "zustand";
import { useApp } from "../../app/store";
import { policyKeyFor } from "./limits";
import { useUsageControl } from "./policy";

export type UsageTab = "activity" | "limits";

interface UsageView {
  tab: UsageTab;
  /** A site the Limits tab should open and scroll to once, then forget. */
  focusHost: string | null;
  /** A section the Limits tab should open under `focusHost`, once. */
  focusSection: string | null;
  setTab: (tab: UsageTab) => void;
  clearFocus: () => void;
}

export const useUsageView = create<UsageView>((set) => ({
  tab: "activity",
  focusHost: null,
  focusSection: null,
  setTab: (tab) => set({ tab }),
  clearFocus: () => set({ focusHost: null, focusSection: null }),
}));

/** Opens Usage on Limits with the requested site or site section expanded and in view. */
export function openLimits(host?: string, section?: string): void {
  const key =
    host && section === undefined
      ? policyKeyFor(useUsageControl.getState().policies, host)
      : (host ?? null);
  useUsageView.setState({ tab: "limits", focusHost: key, focusSection: section ?? null });
  useApp.getState().openSheet("stats");
}
