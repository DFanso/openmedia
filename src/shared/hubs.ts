import type { HubTab, SiteSettings } from "./ipc";
import { hostOf, siteOf } from "./site";

/** The hub the visible page belongs to, and the page's place among the hub's pages. */
export interface ActiveHub {
  recipeId: string;
  name: string;
  tabs: HubTab[];
  /** The index of the page the user is looking at. */
  active: number;
}

/** The host of a hub page, as the user reads it. */
export function tabHost(tab: HubTab): string {
  return hostOf(tab.url) ?? "";
}

const firstSegment = (url: string): string => {
  try {
    return new URL(url).pathname.split("/")[1] ?? "";
  } catch {
    return "";
  }
};

/**
 * The page of the hub an address belongs to, or -1 when the address is on another site or, for
 * a page that points into one area of its site (`/direct/inbox/`), outside that area. Pages
 * are matched by the site they live on, not by their exact address, so a hub page stays the
 * current one while the user walks around inside it, and the rest of the site stays a plain page.
 */
export function tabIndexFor(tabs: readonly HubTab[], url: string): number {
  const site = siteOf(url);
  if (!site) return -1;
  const area = firstSegment(url);
  return tabs.findIndex((tab) => {
    const tabArea = firstSegment(tab.url);
    return siteOf(tab.url) === site && (tabArea === "" || tabArea === area);
  });
}

/**
 * The hub a hub session was opened from, with the page the session is on. The hub comes from the
 * session, never from the address: a plain Instagram page is not a page of the Messages Hub just
 * because the hub also has an Instagram tab. `active` is -1 while the session is outside every
 * page of the hub (a redirect to a login page, say), and the hub bar stays.
 */
export function activeHub(
  sites: readonly SiteSettings[],
  hubId: string | null,
  url: string | null,
): ActiveHub | null {
  if (!hubId) return null;
  const site = sites.find((candidate) => candidate.recipeId === hubId);
  const tabs = site?.hub?.tabs;
  if (!site || !tabs || tabs.length === 0) return null;
  return {
    recipeId: site.recipeId,
    name: site.name,
    tabs,
    active: url ? tabIndexFor(tabs, url) : -1,
  };
}

/**
 * The hub a favorite stands for: a hub's favorite is its homepage (its first page), so it must
 * open as that hub, with the other pages in the bar, not as a plain page of that one site. A
 * single-site recipe that owns the same homepage wins, since then the favorite is that site.
 */
export function hubForFavorite(
  sites: readonly SiteSettings[],
  favoriteUrl: string,
): SiteSettings | undefined {
  const site = siteOf(favoriteUrl);
  if (!site) return undefined;
  const owners = sites.filter(
    (entry) => entry.homepage !== null && siteOf(entry.homepage) === site,
  );
  if (owners.some((entry) => !entry.hub)) return undefined;
  return owners.find((entry) => entry.hub && entry.hub.tabs.length > 0);
}
