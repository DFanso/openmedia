import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { localDay } from "./format";
import type { UsageTarget } from "./section";

export interface UsagePolicy {
  warnSeconds: number | null;
  limitSeconds: number | null;
}
export type UsagePolicies = Record<string, UsagePolicy>;

export type UsageSectionPolicies = Record<string, Record<string, UsagePolicy>>;

export interface UsageControl {
  day: string;
  policies: UsagePolicies;
  sectionPolicies: UsageSectionPolicies;
  seconds: Record<string, number>;
  sectionSeconds: Record<string, Record<string, number>>;
  ready: boolean;
  warning: { host: string; section: string | null; seconds: number } | null;
}

export const useUsageControl = create<UsageControl>(() => ({
  day: localDay(new Date()),
  policies: {},
  sectionPolicies: {},
  seconds: {},
  sectionSeconds: {},
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

/** The strictest policy for a section across the host and its related domains. */
export function policyForSection(
  policies: UsageSectionPolicies,
  host: string,
  section: string,
): UsagePolicy | undefined {
  return Object.keys(policies)
    .filter((site) => host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`))
    .map((site) => policies[site]?.[section])
    .filter((policy): policy is UsagePolicy => policy !== undefined)
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

/** Includes a native domain's section totals before a subdomain reports its scope. */
export function sectionUsageSeconds(
  seconds: Record<string, Record<string, number>>,
  host: string,
  section: string,
): number {
  let total = 0;
  for (const [site, sections] of Object.entries(seconds)) {
    if (host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`))
      total += sections[section] ?? 0;
  }
  return total;
}

export interface UsageLimit {
  policy: UsagePolicy;
  seconds: number;
  /** `null` denotes a whole-site policy; otherwise the locked section. */
  section: string | null;
}

/** The first exhausted whole-site or section policy that applies to a page. */
export function usageLimitForTarget(
  policies: UsagePolicies,
  sectionPolicies: UsageSectionPolicies,
  seconds: Record<string, number>,
  sectionSeconds: Record<string, Record<string, number>>,
  target: UsageTarget,
): UsageLimit | undefined {
  const sitePolicy = policyForHost(policies, target.host);
  const siteSeconds = usageSeconds(seconds, target.host);
  if (limitReached(sitePolicy, siteSeconds) && sitePolicy) {
    return { policy: sitePolicy, seconds: siteSeconds, section: null };
  }
  const partPolicy = policyForSection(sectionPolicies, target.host, target.section);
  const partSeconds = sectionUsageSeconds(sectionSeconds, target.host, target.section);
  return limitReached(partPolicy, partSeconds) && partPolicy
    ? { policy: partPolicy, seconds: partSeconds, section: target.section }
    : undefined;
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

export function isUsageBlocked(target: UsageTarget): boolean {
  const state = useUsageControl.getState();
  return (
    state.ready &&
    usageLimitForTarget(
      state.policies,
      state.sectionPolicies,
      state.seconds,
      state.sectionSeconds,
      target,
    ) !== undefined
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

export const usageSectionPolicies = {
  get: () => invoke<UsageSectionPolicies>("get_usage_section_policies"),
  set: async (
    host: string,
    section: string,
    policy: UsagePolicy,
  ): Promise<UsageSectionPolicies> => {
    const sectionPolicies = await invoke<UsageSectionPolicies>("set_usage_section_policy", {
      host,
      section,
      policy,
    });
    useUsageControl.setState({ sectionPolicies });
    return sectionPolicies;
  },
};
