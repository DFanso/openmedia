import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { localDay } from "./format";

export interface UsagePolicy {
  warnSeconds: number | null;
  limitSeconds: number | null;
}

export type UsagePolicies = Record<string, UsagePolicy>;

export interface UsageControl {
  day: string;
  policies: UsagePolicies;
  seconds: Record<string, number>;
  ready: boolean;
  warning: { host: string; seconds: number } | null;
}

export const useUsageControl = create<UsageControl>(() => ({
  day: localDay(new Date()),
  policies: {},
  seconds: {},
  ready: false,
  warning: null,
}));

export function policyForHost(policies: UsagePolicies, host: string): UsagePolicy | undefined {
  const matches = Object.keys(policies).filter(
    (site) => host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`),
  );
  // A subdomain's allowance must not bypass a configured parent-domain allowance.
  return matches
    .map((site) => policies[site])
    .reduce<UsagePolicy | undefined>((result, policy) => {
      const least = (a: number | null, b: number | null) =>
        a === null ? b : b === null ? a : Math.min(a, b);
      return result
        ? {
            warnSeconds: least(result.warnSeconds, policy.warnSeconds),
            limitSeconds: least(result.limitSeconds, policy.limitSeconds),
          }
        : policy;
    }, undefined);
}

export function limitReached(policy: UsagePolicy | undefined, seconds: number): boolean {
  return policy?.limitSeconds != null && seconds >= policy.limitSeconds;
}

/** Includes a native domain's totals before a newly opened subdomain reports its scope. */
export function usageSeconds(seconds: Record<string, number>, host: string): number {
  let total = 0;
  for (const [site, value] of Object.entries(seconds)) {
    if (host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`)) total += value;
  }
  return total;
}

export function isUsageBlocked(host: string): boolean {
  const state = useUsageControl.getState();
  return (
    state.ready &&
    limitReached(policyForHost(state.policies, host), usageSeconds(state.seconds, host))
  );
}

export const usagePolicies = {
  get: () => invoke<UsagePolicies>("get_usage_policies"),
  set: async (host: string, policy: UsagePolicy): Promise<UsagePolicies> => {
    const policies = await invoke<UsagePolicies>("set_usage_policy", { host, policy });
    useUsageControl.setState({ policies });
    return policies;
  },
};
