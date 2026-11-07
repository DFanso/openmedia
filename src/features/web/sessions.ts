import type { SiteViewState } from "../../shared/ipc";

/** Where a session came from: tapped from favorites, typed or picked from history, or restored. */
export type SessionSource = "favorite" | "typed" | "restored";

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
  /** When the session was last visible or opened, in ms. */
  lastUsed: number;
}

/** Live pages, counting the visible one. Each is a native web view with its own process. */
export const MAX_SESSIONS = 5;
/** A hidden page nobody has looked at for this long is closed. */
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

/**
 * The live session a favorite should switch to instead of opening again: one on the favorite's
 * site, preferring sessions that came from a favorite and then the most recently used. A session
 * whose domain is not known yet matches only the exact address it was opened with.
 */
export function findFavoriteSession(sessions: Session[], favoriteUrl: string): Session | undefined {
  return sessions
    .filter((s) => (s.scope ? scopeCovers(s.scope, favoriteUrl) : s.openedUrl === favoriteUrl))
    .sort(
      (a, b) =>
        Number(b.source === "favorite") - Number(a.source === "favorite") ||
        b.lastUsed - a.lastUsed,
    )[0];
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
 * - `routine`: hidden sessions idle past `IDLE_LIMIT_MS` go; then, while more than `MAX_SESSIONS`
 *   are alive, the least valuable go. Typed pages are cheaper to lose than favorites, and older
 *   goes before newer.
 */
export function sessionsToClose(
  sessions: Session[],
  activeId: string | null,
  now: number,
  pressure: Pressure,
): string[] {
  const hidden = sessions.filter((s) => s.id !== activeId);
  if (pressure === "memory") return hidden.map((s) => s.id);

  const idle = hidden.filter((s) => now - s.lastUsed > IDLE_LIMIT_MS);
  const survivors = hidden
    .filter((s) => !idle.includes(s))
    .sort(
      (a, b) =>
        Number(a.source === "favorite") - Number(b.source === "favorite") ||
        a.lastUsed - b.lastUsed,
    );
  const excess = Math.max(0, sessions.length - idle.length - MAX_SESSIONS);
  return [...idle, ...survivors.slice(0, excess)].map((s) => s.id);
}
