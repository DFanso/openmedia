import { siteOf } from "../../shared/site";
import { normalizeWebUrl } from "../../shared/url";
import {
  sectionUsageSeconds,
  usageSeconds,
  type SectionPolicies,
  type UsageLimits,
  type UsagePolicies,
  type UsagePolicy,
} from "./policy";

/** The values a duration slider snaps to: fine steps where they matter, coarse ones up to a day. */
export const LIMIT_STOPS = [
  5, 10, 15, 20, 25, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480, 600, 720, 1440,
];
export const MAX_LIMIT_MINUTES = 1440;
export const LIMIT_PRESETS = [30, 60, 120, 180];
export const DEFAULT_LIMIT_MINUTES = 60;

/** Both thresholds in minutes; `null` means that threshold is off. */
export interface Thresholds {
  warn: number | null;
  limit: number | null;
}

export function toMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

export function thresholdsOf(policy: UsagePolicy | undefined): Thresholds {
  return {
    warn: policy?.warnSeconds == null ? null : toMinutes(policy.warnSeconds),
    limit: policy?.limitSeconds == null ? null : toMinutes(policy.limitSeconds),
  };
}

export function policyOf(thresholds: Thresholds): UsagePolicy {
  return {
    warnSeconds: thresholds.warn === null ? null : thresholds.warn * 60,
    limitSeconds: thresholds.limit === null ? null : thresholds.limit * 60,
  };
}

/** The slider stops, plus any saved value that is not one of them, so a thumb can always sit on it. */
export function stopsFor(...values: (number | null)[]): number[] {
  const stops = new Set(LIMIT_STOPS);
  for (const value of values) if (value !== null) stops.add(value);
  return [...stops].sort((a, b) => a - b);
}

/** The reminder slider stops short of a full day, so a limit always fits above it. */
export function warnStops(stops: readonly number[]): number[] {
  return stops.filter((stop) => stop < MAX_LIMIT_MINUTES);
}

/**
 * Keeps the reminder strictly before the limit after one of them moved. The one that did not move
 * is pulled to the neighbouring stop, so dragging never fails and never needs an error message.
 */
export function reconcile(
  changed: "warn" | "limit",
  next: Thresholds,
  stops: readonly number[],
): Thresholds {
  const { warn, limit } = next;
  if (warn === null || limit === null || warn < limit) return next;
  if (changed === "warn") {
    const above = stops.find((stop) => stop > warn);
    if (above !== undefined) return { warn, limit: above };
  }
  const below = [...stops].reverse().find((stop) => stop < limit);
  return { warn: below ?? null, limit };
}

/** About three quarters of the way to the limit, on a stop: a reminder with room to wrap up. */
export function suggestedWarn(limitMinutes: number, stops: readonly number[]): number | null {
  const target = Math.floor(limitMinutes * 0.75);
  return [...stops].reverse().find((stop) => stop <= target) ?? null;
}

export function withPreset(minutes: number): Thresholds {
  return { limit: minutes, warn: suggestedWarn(minutes, LIMIT_STOPS) };
}

export type LimitState = "none" | "ok" | "warned" | "reached";

export interface LimitStatus {
  state: LimitState;
  /** How full the meter is, 0 to 1, against the limit (or the reminder when there is no limit). */
  fraction: number;
  /** Where the reminder sits on the meter, when both thresholds are set. */
  warnFraction: number | null;
  untilLimit: number | null;
  untilWarn: number | null;
}

export function limitStatus(policy: UsagePolicy | undefined, spentSeconds: number): LimitStatus {
  const spent = Math.floor(spentSeconds);
  const warn = policy?.warnSeconds ?? null;
  const limit = policy?.limitSeconds ?? null;
  const scale = limit ?? warn;
  if (scale === null) {
    return { state: "none", fraction: 0, warnFraction: null, untilLimit: null, untilWarn: null };
  }
  const state: LimitState =
    limit !== null && spent >= limit ? "reached" : warn !== null && spent >= warn ? "warned" : "ok";
  return {
    state,
    fraction: Math.min(spent / scale, 1),
    warnFraction: warn !== null && limit !== null ? warn / limit : null,
    untilLimit: limit === null ? null : Math.max(0, limit - spent),
    untilWarn: warn === null ? null : Math.max(0, warn - spent),
  };
}

export function secondsUntilMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

/** The registrable domain a typed address belongs to, the key policies are stored under. */
export function hostFor(value: string): string | null {
  const normalized = normalizeWebUrl(value);
  return normalized ? siteOf(normalized) : null;
}

/** The saved policy key that governs `host`, matching how limits are applied to subdomains. */
export function policyKeyFor(policies: UsagePolicies, host: string): string {
  return (
    Object.keys(policies).find(
      (site) => host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`),
    ) ?? host
  );
}

export interface LimitSite {
  host: string;
  /** The favorite's own name, when the site is a favorite. */
  name: string | null;
}

/** Favorites first, in their own order; then every other site that has a limit or was just added. */
export function limitSites(
  favorites: readonly { name: string; url: string }[],
  policies: UsagePolicies,
  added: readonly string[],
): { favorites: LimitSite[]; others: LimitSite[] } {
  const seen = new Set<string>();
  const favoriteSites: LimitSite[] = [];
  for (const favorite of favorites) {
    const host = siteOf(favorite.url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    favoriteSites.push({ host, name: favorite.name });
  }
  const others: LimitSite[] = [];
  for (const host of [...Object.keys(policies), ...added]) {
    if (seen.has(host)) continue;
    seen.add(host);
    others.push({ host, name: null });
  }
  return { favorites: favoriteSites, others };
}

/** Sites worth offering as one-tap additions: today's busiest first, then recent addresses. */
export function suggestHosts(
  history: readonly string[],
  seconds: Record<string, number>,
  taken: ReadonlySet<string>,
  max = 6,
): string[] {
  const used = Object.entries(seconds)
    .sort((a, b) => b[1] - a[1])
    .map(([host]) => host);
  const recent = history.map(hostFor);
  const suggestions: string[] = [];
  for (const host of [...used, ...recent]) {
    if (!host || taken.has(host) || suggestions.includes(host)) continue;
    suggestions.push(host);
    if (suggestions.length === max) break;
  }
  return suggestions;
}

/** The parts of a site to offer: the ones used recently, plus the ones that carry a limit. */
export function siteParts(
  host: string,
  used: readonly string[],
  sections: SectionPolicies,
): string[] {
  const parts = new Set(used);
  for (const section of Object.keys(sections[host] ?? {})) parts.add(section);
  return [...parts];
}

/** A site or a part of a site that carries a daily limit, and where today stands against it. */
export interface LimitedThing {
  host: string;
  /** The part of the site, when the limit is on one; `null` for the site itself. */
  section: string | null;
  policy: UsagePolicy;
  spent: number;
  status: LimitStatus;
}

/** Every site and every part of a site with a limit, closest to its limit first. */
export function limitedThings(
  limits: UsageLimits,
  seconds: Record<string, number>,
  sectionSeconds: Record<string, Record<string, number>>,
): LimitedThing[] {
  const things: LimitedThing[] = [];
  for (const [host, policy] of Object.entries(limits.sites)) {
    const spent = usageSeconds(seconds, host);
    const status = limitStatus(policy, spent);
    if (status.state !== "none") things.push({ host, section: null, policy, spent, status });
  }
  for (const [host, parts] of Object.entries(limits.sections)) {
    for (const [section, policy] of Object.entries(parts)) {
      const spent = sectionUsageSeconds(sectionSeconds, host, section);
      const status = limitStatus(policy, spent);
      if (status.state !== "none") things.push({ host, section, policy, spent, status });
    }
  }
  return things.sort((a, b) => b.status.fraction - a.status.fraction);
}
