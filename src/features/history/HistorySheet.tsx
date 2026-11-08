import { useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import { displayHost, isFavoriteSite, toggleSiteFavorite } from "../../shared/favorites";
import { ArrowIcon, HistoryIcon, StarIcon } from "../../shared/icons";
import { useIconForUrl } from "../../shared/siteIcons";
import type { Favorite } from "../../shared/ipc";
import { Screen } from "../../shared/Screen";
import { SiteTile } from "../../shared/SiteTile";
import { describeAddress } from "./address";

const NO_HISTORY: string[] = [];

/** Addresses the user typed, newest first. */
export function HistorySheet() {
  const open = useApp((s) => s.sheet === "history");
  const history = useApp((s) => s.state?.history) ?? NO_HISTORY;
  const favorites = useApp((s) => s.state?.favorites);
  const closeSheet = useApp((s) => s.closeSheet);
  const openHistory = useApp((s) => s.openHistory);
  const saveFavorites = useApp((s) => s.saveFavorites);
  const t = useT();
  const favoriteList = favorites ?? [];
  if (!open) return null;

  return (
    <Screen
      title={t("history.title")}
      subtitle={
        history.length === 0 ? t("history.empty") : t("history.subtitle", { count: history.length })
      }
      closeLabel={t("history.close")}
      onClose={closeSheet}
    >
      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-8 pt-16 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-paper/[0.06] text-paper/50">
            <HistoryIcon />
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-paper/55">{t("history.emptyBody")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
          {history.map((url) => (
            <HistoryRow
              key={url}
              url={url}
              favorites={favoriteList}
              onOpen={() => openHistory(url)}
              onToggle={() => void saveFavorites(toggleSiteFavorite(favoriteList, url))}
            />
          ))}
        </ul>
      )}
    </Screen>
  );
}

interface RowProps {
  url: string;
  favorites: Favorite[];
  onOpen: () => void;
  onToggle: () => void;
}

/** One address: the row opens it, and the star beside it is a button of its own. */
function HistoryRow({ url, favorites, onOpen, onToggle }: RowProps) {
  const { host, rest } = describeAddress(url);
  const site = displayHost(url);
  const favorited = isFavoriteSite(favorites, url);
  const t = useT();
  const starLabel = t(favorited ? "commandBar.removeFavorite" : "commandBar.addFavorite", {
    site,
  });
  const icon = useIconForUrl(url, favorites);

  return (
    <li className="flex items-center">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start active:bg-paper/[0.06]"
      >
        <SiteTile name={host} icon={icon} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{host}</span>
          {rest && (
            <span className="mt-0.5 block truncate text-sm text-paper/50 tabular-nums">{rest}</span>
          )}
        </span>
        <span className="shrink-0 text-paper/35">
          <ArrowIcon />
        </span>
      </button>
      <button
        type="button"
        aria-pressed={favorited}
        aria-label={starLabel}
        onClick={onToggle}
        className={`grid size-12 shrink-0 place-items-center active:bg-paper/[0.06] ${
          favorited ? "text-accent" : "text-paper/45"
        }`}
      >
        <StarIcon filled={favorited} />
      </button>
    </li>
  );
}
