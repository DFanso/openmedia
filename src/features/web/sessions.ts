import { quickAccess } from "../../shared/favorites";
import type { SiteViewState } from "../../shared/ipc";

/** Where a session came from: favorites, a hub tab, typed input, or restored app state. */
export type SessionSource = "favorite" | "hub" | "typed" | "restored";

export interface Session {
  id: string;
  source: SessionSource;
  /** The address the session was opened with. */
  openedUrl: string;
  /** The registrable domain the native side pinned the session to; unknown until it loads. */
  scope: string | null;
  url: string | null;
  title: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The page has drawn its first content and is showing. */
  painted: boolean;
  /** When the session was last visible or opened, in ms. */
  lastUsed: number;
}

/** Usual total session budget; expands only for quick-access pages plus the visible page. */
export const MAX_SESSIONS = 5;
/** Unprotected hidden pages idle longer than this are closed. */
export const IDLE_LIMIT_MS = 20 * 60_000;

export function newSession(id: string, source: SessionSource, url: string, now: number): Session {
  return {
    id,
    source,
    openedUrl: url,
    scope: null,
    url: null,
    title: null,
    loading: true,
    canGoBack: false,
    canGoForward: false,
    painted: false,
    lastUsed: now,
  };
}

export function applyState(session: Session, state: SiteViewState): Session {
  return {
    ...session,
    scope: state.scope,
    url: state.url,
    title: state.title,
    loading: state.loading,
    canGoBack: state.canGoBack,
    canGoForward: state.canGoForward,
    painted: state.painted,
  };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True for the scope itself and its subdomains, never for a lookalike such as `notx.com`. */
export function scopeCovers(scope: string, url: string): boolean {
  const host = hostOf(url);
  return host !== null && (host === scope || host.endsWith(`.${scope}`));
}

/** The live session on the requested site, preferring favorites then recent use. */
function findSessionOnSite(
  sessions: Session[],
  url: string,
  role: "site" | "favorite" | "hub",
): Session | undefined {
  let found: Session | undefined;
  for (const session of sessions) {
    if (
      (role === "favorite" && session.source === "hub") ||
      (role === "hub" && session.source !== "hub") ||
      !(session.scope ? scopeCovers(session.scope, url) : session.openedUrl === url)
    ) {
      continue;
    }
    if (
      !found ||
      (session.source === "favorite" && found.source !== "favorite") ||
      ((session.source === "favorite") === (found.source === "favorite") &&
        session.lastUsed > found.lastUsed)
    ) {
      found = session;
    }
  }
  return found;
}

/** A live session a favorite can reuse; hub tabs stay separate even when they share its domain. */
export function findFavoriteSession(sessions: Session[], favoriteUrl: string): Session | undefined {
  return findSessionOnSite(sessions, favoriteUrl, "favorite");
}

/** A live session on the favorite's site, including one opened from a hub, for badge/retention. */
export function findSiteSession(sessions: Session[], url: string): Session | undefined {
  return findSessionOnSite(sessions, url, "site");
}

/** A live session for a hub tab, never an ordinary favorite on the same site. */
export function findHubSession(sessions: Session[], tabUrl: string): Session | undefined {
  return findSessionOnSite(sessions, tabUrl, "hub");
}

/**
 * The page the app opens with. One on a favorite's site counts as a favorite session, so the
 * session cap spares it like any other favorite.
 */
export function startSource(favorites: { url: string }[], url: string): SessionSource {
  const host = hostOf(url);
  return host !== null && favorites.some((favorite) => hostOf(favorite.url) === host)
    ? "favorite"
    : "restored";
}

/** The live typed session opened with exactly this address, so a history tap does not reload. */
export function findTypedSession(sessions: Session[], url: string): Session | undefined {
  return sessions
    .filter((s) => s.source === "typed" && s.openedUrl === url)
    .sort((a, b) => b.lastUsed - a.lastUsed)[0];
}

export type Pressure = "routine" | "memory";

/**
 * Which hidden sessions to close. The visible one is never listed.
 *
 * - `memory`: the OS asked for memory back, so every hidden session goes.
 * - `routine`: keep the session each quick-access favorite would activate. Other hidden pages
 *   expire after `IDLE_LIMIT_MS`, then the oldest non-favorites go first to meet the usual cap.
 *   The cap grows only enough for the retained sessions plus the visible page.
 */
export function sessionsToClose(
  sessions: Session[],
  activeId: string | null,
  now: number,
  pressure: Pressure,
  favorites: readonly { url: string }[],
): string[] {
  const hidden = sessions.filter((s) => s.id !== activeId);
  if (pressure === "memory") return hidden.map((s) => s.id);

  const retained = new Set<string>();
  for (const { url } of quickAccess(favorites)) {
    const session = findSiteSession(sessions, url);
    if (session) retained.add(session.id);
  }
  const unprotected = hidden.filter((s) => !retained.has(s.id));
  const idle = unprotected.filter((s) => now - s.lastUsed > IDLE_LIMIT_MS);
  const survivors = unprotected
    .filter((s) => !idle.includes(s))
    .sort(
      (a, b) =>
        Number(a.source === "favorite") - Number(b.source === "favorite") ||
        a.lastUsed - b.lastUsed,
    );
  const required = retained.size + Number(activeId !== null && !retained.has(activeId));
  const limit = Math.max(MAX_SESSIONS, required);
  const excess = Math.max(0, sessions.length - idle.length - limit);
  return [...idle, ...survivors.slice(0, excess)].map((s) => s.id);
}
