import { siteOf } from "../../shared/site";
import type { Favorite, SiteUsage } from "../../shared/ipc";
import { findFavoriteSession, type Session } from "./sessions";

/** How many favorites are opened quietly at launch. */
export const WARM_LIMIT = 2;

/** How long the page the reader asked for gets to itself before the others start loading. */
export const WARM_DELAY_MS = 2500;

/** The days of use the prediction looks at. */
export const WARM_USAGE_DAYS = 14;

/**
 * The favorites the reader is most likely to open next: the ones they spent the most time on
 * lately, among those with no live session. A favorite with no recorded time keeps the order the
 * reader gave their favorites, so a new install still warms the first ones. Folders and hubs are
 * not predicted: a favorite stands for one page.
 */
export function pickWarmFavorites(
  favorites: readonly Favorite[],
  sessions: readonly Session[],
  usage: readonly SiteUsage[],
  limit: number = WARM_LIMIT,
): Favorite[] {
  const seconds = new Map<string, number>();
  for (const site of usage) {
    const key = siteOf(`https://${site.host}/`);
    if (key) seconds.set(key, (seconds.get(key) ?? 0) + site.seconds);
  }
  const seen = new Set<string>();
  return favorites
    .map((favorite, index) => ({ favorite, index, site: siteOf(favorite.url) }))
    .filter(({ favorite, site }) => {
      if (!site || seen.has(site)) return false;
      seen.add(site);
      return findFavoriteSession(sessions as Session[], favorite.url) === undefined;
    })
    .sort(
      (a, b) =>
        (seconds.get(b.site ?? "") ?? 0) - (seconds.get(a.site ?? "") ?? 0) || a.index - b.index,
    )
    .slice(0, limit)
    .map(({ favorite }) => favorite);
}
