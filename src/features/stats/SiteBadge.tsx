import { useApp } from "../../app/store";
import type { Favorite } from "../../shared/ipc";
import { useIconForUrl } from "../../shared/siteIcons";
import { SiteTile } from "../../shared/SiteTile";
import { scopeCovers } from "../web/sessions";

const NO_FAVORITES: Favorite[] = [];

/** The name to show for a site: its favorite's name when there is one, else the address. */
export function nameForHost(host: string, favorites: readonly Favorite[]): string {
  return favorites.find((favorite) => scopeCovers(host, favorite.url))?.name ?? host;
}

export function useFavorites(): Favorite[] {
  return useApp((s) => s.state?.favorites) ?? NO_FAVORITES;
}

/** A site's own icon, or its first letter when the icon is not known yet. */
export function SiteBadge({ host, name }: { host: string; name: string }) {
  const favorites = useFavorites();
  const icon = useIconForUrl(`https://${host}/`, favorites);
  return <SiteTile name={name} icon={icon} />;
}
