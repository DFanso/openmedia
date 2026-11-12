import type { Session, SessionSource } from "../web/sessions";

/** A site that was open and is not any more, kept so the Tabs screen can reopen it. */
export interface ClosedTab {
  /** The id the session had; unique among closed tabs. */
  id: string;
  /** Where the page was when it closed. */
  url: string;
  title: string | null;
  source: SessionSource;
  hubId: string | null;
  closedAt: number;
}

/** How many closed sites the Tabs screen keeps. They live in memory only. */
export const MAX_CLOSED_TABS = 10;

/** The closed site a session leaves behind. */
export function closedTabFrom(session: Session, now: number): ClosedTab {
  return {
    id: session.id,
    url: session.url ?? session.openedUrl,
    title: session.title?.trim() || null,
    source: session.source,
    hubId: session.hubId,
    closedAt: now,
  };
}

/**
 * The closed sites with `sessions` added, newest first. A page that is already listed moves to the
 * top instead of listing twice, and the oldest fall off past `MAX_CLOSED_TABS`.
 */
export function rememberClosed(
  closed: readonly ClosedTab[],
  sessions: readonly Session[],
  now: number,
): ClosedTab[] {
  if (sessions.length === 0) return [...closed];
  const added = sessions.map((session) => closedTabFrom(session, now));
  const urls = new Set(added.map((tab) => tab.url));
  return [...added, ...closed.filter((tab) => !urls.has(tab.url))].slice(0, MAX_CLOSED_TABS);
}

/** The closed sites without the one being reopened. */
export function withoutClosed(closed: readonly ClosedTab[], id: string): ClosedTab[] {
  return closed.filter((tab) => tab.id !== id);
}
