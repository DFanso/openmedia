import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../app/store";
import { CloseIcon } from "../../shared/icons";
import { errorMessage, usage, type SiteUsage, type UsageReport } from "../../shared/ipc";
import { scopeCovers } from "../web/sessions";
import { formatDuration, localDay, sectionLabel } from "./format";
import { settleUsageWrites } from "./tracker";

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const NO_FAVORITES: { name: string; url: string }[] = [];

function Bar({ share }: { share: number }) {
  return (
    <span className="mt-1.5 block h-1 rounded-full bg-paper/10">
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${Math.max(share, 0.02) * 100}%` }}
      />
    </span>
  );
}

function SiteRow({ site, name, largest }: { site: SiteUsage; name: string; largest: number }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="block w-full rounded-2xl px-3 py-3 text-left active:bg-paper/[0.06]"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-base text-paper">{name}</span>
          <span className="shrink-0 text-sm text-paper/70 tabular-nums">
            {formatDuration(site.seconds)}
          </span>
        </span>
        {name !== site.host && (
          <span className="block truncate text-xs text-paper/45">{site.host}</span>
        )}
        <Bar share={site.seconds / largest} />
      </button>
      {open && (
        <ul className="mb-2 ml-6 border-l border-hair pl-3">
          {site.sections.map((section) => (
            <li key={section.section} className="py-1.5">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-paper/85">{sectionLabel(section.section)}</span>
                <span className="shrink-0 text-paper/60 tabular-nums">
                  {formatDuration(section.seconds)}
                </span>
              </span>
              <Bar share={section.seconds / site.seconds} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ClearStats({ onCleared }: { onCleared: () => void }) {
  const reportError = useApp((s) => s.reportError);
  const [confirming, setConfirming] = useState(false);

  const clear = () => {
    setConfirming(false);
    usage
      .clear()
      .then(onCleared)
      .catch((error: unknown) => reportError(errorMessage(error)));
  };

  return confirming ? (
    <div className="mt-3 flex gap-3">
      <button
        type="button"
        onClick={clear}
        className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent"
      >
        Clear all stats
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-full border border-hair px-5 py-2.5 text-sm font-medium text-paper/85"
      >
        Cancel
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-3 rounded-full border border-hair px-5 py-2.5 text-sm font-medium text-paper/85"
    >
      Clear stats
    </button>
  );
}

/** Time spent on each site and in each part of it. Full-screen so no page shows through. */
export function StatsSheet() {
  const open = useApp((s) => s.sheet === "stats");
  const favorites = useApp((s) => s.state?.favorites) ?? NO_FAVORITES;
  const closeSheet = useApp((s) => s.closeSheet);
  const reportError = useApp((s) => s.reportError);
  const [days, setDays] = useState<number>(7);
  const [report, setReport] = useState<UsageReport | null>(null);

  const load = useCallback(
    () =>
      settleUsageWrites()
        .then(() => usage.report(localDay(new Date()), days))
        .then(setReport)
        .catch((error: unknown) => reportError(errorMessage(error))),
    [days, reportError],
  );

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const nameOf = (site: SiteUsage) =>
    site.name ??
    favorites.find((favorite) => scopeCovers(site.host, favorite.url))?.name ??
    site.host;
  const largest = report?.sites[0]?.seconds ?? 1;

  return (
    <div data-hit="" className="fixed inset-0 z-50 flex flex-col bg-ink">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
        <h1 className="text-xs font-medium tracking-[0.22em] text-paper/60 uppercase">Stats</h1>
        <button
          type="button"
          aria-label="Close stats"
          onClick={closeSheet}
          className="grid size-11 place-items-center rounded-full text-paper/80"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+32px)]">
        <div role="group" aria-label="Time range" className="flex gap-2">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              aria-pressed={days === range.days}
              onClick={() => setDays(range.days)}
              className={`rounded-full border px-4 py-2 text-sm ${
                days === range.days ? "border-accent text-accent" : "border-hair text-paper/70"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>

        <p className="mt-6 text-xs tracking-[0.18em] text-paper/50 uppercase">Time on sites</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums">
          {formatDuration(report?.totalSeconds ?? 0)}
        </p>

        {report && report.sites.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-paper/55">
            Nothing recorded for this period yet. Time on a site page shows up here.
          </p>
        ) : (
          <ul className="-mx-3 mt-3">
            {report?.sites.map((site) => (
              <SiteRow key={site.host} site={site} name={nameOf(site)} largest={largest} />
            ))}
          </ul>
        )}

        <section className="mt-8 rounded-2xl border border-hair p-4">
          <h2 className="text-sm font-semibold">Private to this phone</h2>
          <p className="mt-1 text-sm leading-relaxed text-paper/60">
            This information stays on this phone and is never sent anywhere. OpenMedia has no server
            and keeps no copy. Only site names, section names (like &ldquo;Watch&rdquo; or
            &ldquo;Shorts&rdquo;) and seconds are stored: never full addresses, searches or page
            titles. Tap a site to see which parts of it you used.
          </p>
          <ClearStats onCleared={() => void load()} />
        </section>
      </div>
    </div>
  );
}
