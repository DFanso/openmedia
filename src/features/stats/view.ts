import { create } from "zustand";
import { useApp } from "../../app/store";
import { policyKeyFor } from "./limits";
import { useUsageControl } from "./policy";

export type UsageTab = "activity" | "limits";

interface UsageView {
  tab: UsageTab;
  /** A site the Limits tab should open and scroll to once, then forget. */
  focusHost: string | null;
  setTab: (tab: UsageTab) => void;
  clearFocus: () => void;
}

export const useUsageView = create<UsageView>((set) => ({
  tab: "activity",
  focusHost: null,
  setTab: (tab) => set({ tab }),
  clearFocus: () => set({ focusHost: null }),
}));

/** Opens Usage on the Limits tab, with `host` (when given) expanded and in view. */
export function openLimits(host?: string): void {
  const key = host ? policyKeyFor(useUsageControl.getState().policies, host) : null;
  useUsageView.setState({ tab: "limits", focusHost: key });
  useApp.getState().openSheet("stats");
}
