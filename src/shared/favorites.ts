/** How many favorites the floating button fans out. The rest stay in Settings. */
export const QUICK_ACCESS_LIMIT = 6;

/** The favorites that appear when the floating button is held: the first few, in order. */
export function quickAccess<T>(favorites: readonly T[]): T[] {
  return favorites.slice(0, QUICK_ACCESS_LIMIT);
}

/** Site icons by host, taken from the favorites that already have one. */
export function iconsByHost(favorites: readonly { url: string; icon?: string }[]) {
  const icons = new Map<string, string>();
  for (const { url, icon } of favorites) {
    if (!icon) continue;
    try {
      icons.set(new URL(url).host, icon);
    } catch {
      // a favorite without a readable address has no host to match
    }
  }
  return icons;
}
