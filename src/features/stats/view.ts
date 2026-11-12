import { create } from "zustand";
import { useApp } from "../../app/store";
import { policyKeyFor } from "./limits";
import { useUsageControl } from "./policy";

export type UsageTab = "activity" | "limits";

interface UsageView {
  tab: UsageTab;
  /** A site the Limits tab should open and scroll to once, then forget. */
  focusHost: string | null;
  /** The part of that site the Limits tab should open, when the limit is on one. */
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

/** Opens Usage on the Limits tab, with `host` (when given) expanded and in view. */
export function openLimits(host?: string, section?: string): void {
  const key = host ? policyKeyFor(useUsageControl.getState().limits.sites, host) : null;
  useUsageView.setState({ tab: "limits", focusHost: key, focusSection: section ?? null });
  useApp.getState().openSheet("stats");
}
