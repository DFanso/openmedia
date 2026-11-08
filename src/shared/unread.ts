const LEADING_COUNT = /^\s*[([](\d{1,4})(\+?)[)\]]/;

/** Largest count shown; sites cap their own counters near this, and a page can claim anything. */
export const MAX_UNREAD = 999;

/**
 * The unread count a page announces in its title: `(3) Messenger`, `[12] Inbox` or `(9+) Home`.
 * Sites put it first by convention; a number anywhere else in a title is just text. Zero when the
 * title announces nothing.
 */
export function unreadCount(title: string | null): number {
  const match = title ? LEADING_COUNT.exec(title) : null;
  return match ? Math.min(Number(match[1]), MAX_UNREAD) : 0;
}
