import { isPlatformUrl, PLATFORMS, type Platform } from "./platforms";

interface Props {
  /** Addresses of the favorites being edited, saved or not. */
  urls: string[];
  full: boolean;
  onAdd: (platform: Platform) => void;
  onRemove: (platform: Platform) => void;
}

/** Every bundled platform with a toggle; changes land in the favorites draft, not on disk. */
export function PlatformCatalog({ urls, full, onAdd, onRemove }: Props) {
  return (
    <div className="mt-8">
      <h3 className="text-xs font-medium tracking-[0.18em] text-paper/55 uppercase">
        Popular platforms
      </h3>
      <p className="mt-1 text-sm text-paper/55">
        The largest social platforms. Add one to your favorites, then save.
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-hair rounded-2xl border border-hair">
        {PLATFORMS.map((platform) => {
          const added = urls.some((url) => isPlatformUrl(platform, url));
          return (
            <li key={platform.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium">{platform.name}</p>
                <p className="truncate text-sm text-paper/55">
                  {platform.owner} · {platform.users}
                </p>
              </div>
              <button
                type="button"
                aria-label={`${added ? "Remove" : "Add"} ${platform.name} ${added ? "from" : "to"} favorites`}
                aria-pressed={added}
                disabled={!added && full}
                onClick={() => (added ? onRemove(platform) : onAdd(platform))}
                className={
                  added
                    ? "rounded-full border border-hair px-4 py-1.5 text-sm font-medium text-paper/85"
                    : "rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-30"
                }
              >
                {added ? "Added" : "Add"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
