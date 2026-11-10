import { create } from "zustand";

import { BUNDLED_ICON_BY_DOMAIN } from "./bundledSiteIcons";
import type { Favorite } from "./ipc";
import { hostOf, registrableDomain } from "./site";

/** The icons the app fetched at runtime, by host. */
interface IconCache {
  icons: Record<string, string>;
  setIcons: (icons: Record<string, string>) => void;
}

/**
 * The icons the app has fetched from sites, by host. The shell fills it from `refresh_icons`;
 * a row that reads it through `useIconForUrl` redraws when an icon arrives.
 */
export const useIconCache = create<IconCache>((set) => ({
  icons: {},
  setIcons: (icons) => set({ icons }),
}));

/** Puts the icons Rust returned into the cache, keeping the ones already there. */
export function setIconCache(icons: Record<string, string>): void {
  useIconCache.setState((current) => ({ icons: { ...current.icons, ...icons } }));
}

/** The icons the app has fetched at runtime, by host. */
export function getIconCache(): Record<string, string> {
  return useIconCache.getState().icons;
}

/** True when the site has an icon that ships with the app. */
export function hasBundledIcon(host: string): boolean {
  const lower = host.toLowerCase();
  return (
    BUNDLED_ICON_BY_DOMAIN[lower] !== undefined ||
    BUNDLED_ICON_BY_DOMAIN[registrableDomain(lower)] !== undefined
  );
}

/**
 * The icon of a site, from wherever it is known: the one that ships with the app, else the one
 * the app fetched from the site, else the one of a favorite on the same site.
 */
function knownIcon(
  host: string,
  cache: Record<string, string>,
  favorites: readonly Favorite[],
): string | undefined {
  const lower = host.toLowerCase();
  const bundled = BUNDLED_ICON_BY_DOMAIN[lower] ?? BUNDLED_ICON_BY_DOMAIN[registrableDomain(lower)];
  if (bundled) return bundled;
  const fetched = cache[lower] ?? cache[registrableDomain(lower)];
  if (fetched) return fetched;
  for (const favorite of favorites) {
    if (!favorite.icon) continue;
    const favoriteHost = hostOf(favorite.url);
    if (!favoriteHost) continue;
    if (favoriteHost === lower || registrableDomain(favoriteHost) === registrableDomain(lower)) {
      return favorite.icon;
    }
  }
  return undefined;
}

/**
 * The icon to show for an address: the one that ships with the app, else the one the app fetched
 * from the site, else the one of a favorite on the same site. Nothing when none is known, so the
 * caller can fall back to the site's monogram.
 */
export function iconForUrl(url: string, favorites: readonly Favorite[]): string | undefined {
  const host = hostOf(url);
  if (!host) return undefined;
  return knownIcon(host, useIconCache.getState().icons, favorites);
}

/** The icon to show for an address, redrawn when one arrives. */
export function useIconForUrl(url: string, favorites: readonly Favorite[]): string | undefined {
  const host = hostOf(url);
  const domain = host ? registrableDomain(host) : "";
  const fetched = useIconCache((cache) =>
    host ? (cache.icons[host] ?? cache.icons[domain]) : undefined,
  );
  if (!host) return undefined;
  return knownIcon(host, fetched ? { [host]: fetched } : {}, favorites);
}

/**
 * The addresses that still need an icon from the site itself. The sites that ship with an icon
 * are left out, so the app never asks the network for an icon it already has.
 */
export function urlsWithoutBundledIcon(urls: readonly string[]): string[] {
  return urls.filter((url) => {
    const host = hostOf(url);
    return !host || !hasBundledIcon(host);
  });
}
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** A safe HTTPS page URL for the site icon fetcher; never accepts a URL or a local/IP host. */
export function faviconPageUrlForHost(host: string | undefined): string | undefined {
  if (!host) return undefined;
  const hostname = host.toLowerCase().replace(/^\*\./, "");
  const labels = hostname.split(".");
  if (
    hostname.length > 253 ||
    labels.length < 2 ||
    labels.some((label) => !HOST_LABEL.test(label)) ||
    !/[a-z]/.test(labels[labels.length - 1])
  ) {
    return undefined;
  }
  return `https://${hostname}/`;
}
