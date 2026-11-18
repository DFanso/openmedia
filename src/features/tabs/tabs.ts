import type { UsageReport } from "../../shared/ipc";
import { scopeCovers, type Session } from "../web/sessions";

/** The open sites as the Tabs screen lists them: the visible one first, then the most recently used. */
export function orderedTabs(sessions: readonly Session[], activeId: string | null): Session[] {
  return [...sessions].sort(
    (a, b) => Number(b.id === activeId) - Number(a.id === activeId) || b.lastUsed - a.lastUsed,
  );
}

/** Highest number a shortcut can select directly: `tab.select1` to `tab.select8`. */
export const NUMBERED_TABS = 8;

/** The number keyboard shortcut that selects the tab at `index` (0-based), or null past the eighth. */
export function tabNumber(index: number): number | null {
  return index >= 0 && index < NUMBERED_TABS ? index + 1 : null;
}

/** A copy of `sessions` with `id` moved to `toIndex` (clamped); unchanged when `id` is unknown. */
export function moveTab(sessions: readonly Session[], id: string, toIndex: number): Session[] {
  const from = sessions.findIndex((session) => session.id === id);
  const next = [...sessions];
  if (from < 0) return next;
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), sessions.length - 1);
  if (to === from) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Every session but the visible one: what "Close the others" ends. */
export function hiddenTabIds(sessions: readonly Session[], activeId: string | null): string[] {
  return sessions.filter((session) => session.id !== activeId).map((session) => session.id);
}

/**
 * The session to show after `closedId` goes: the most recently used of the rest, or null when
 * nothing is left. The last open site is never closed from the Tabs screen, so the app always
 * has a page.
 */
export function tabAfterClose(sessions: readonly Session[], closedId: string): string | null {
  const rest = sessions.filter((session) => session.id !== closedId);
  return (
    rest.reduce<Session | null>((best, s) => (!best || s.lastUsed > best.lastUsed ? s : best), null)
      ?.id ?? null
  );
}

/** Foreground seconds today on a session's site, or null when the usage report has no entry. */
export function secondsTodayFor(report: UsageReport | null, scope: string | null): number | null {
  if (!report || !scope) return null;
  const sites = report.sites.filter(
    (site) => site.host === scope || scopeCovers(scope, `https://${site.host}/`),
  );
  return sites.length === 0 ? null : sites.reduce((total, site) => total + site.seconds, 0);
}

/** A duration in ms as the user reads it: `340 ms`, `1.2 s`, `12 s`. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
}
