import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../app/store";
import { describeError } from "../../i18n/errors";
import type { MessageKey } from "../../i18n/messages";
import { useT } from "../../i18n/useT";
import { DownIcon } from "../../shared/icons";
import { usage, type SiteUsage, type UsageReport } from "../../shared/ipc";
import { quietButton, primaryButton } from "../settings/ui";
import { formatDuration, localDay, sectionLabel } from "./format";
import { limitStatus } from "./limits";
import { policyForHost, usageSeconds, useUsageControl } from "./policy";
import { nameForHost, SiteBadge, useFavorites } from "./SiteBadge";
import { settleUsageWrites } from "./tracker";
import { statusText, UsageMeter } from "./UsageMeter";
import { openLimits, useUsageView } from "./view";

const RANGES: { days: number; label: MessageKey }[] = [
  { days: 1, label: "stats.today" },
  { days: 7, label: "stats.days7" },
  { days: 30, label: "stats.days30" },
];

function Bar({ share }: { share: number }) {
  return (
    <span className="mt-2 block h-1.5 rounded-full bg-paper/10">
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${Math.max(share, 0.02) * 100}%` }}
      />
    </span>
  );
}

function SiteRow({
  site,
  name,
  largest,
  showLimit,
}: {
  site: SiteUsage;
  name: string;
  largest: number;
  showLimit: boolean;
}) {
  const t = useT();
  const policies = useUsageControl((s) => s.policies);
  const [open, setOpen] = useState(false);
  const policy = policyForHost(policies, site.host);
  const meter = showLimit && limitStatus(policy, site.seconds).state !== "none";
  return (
    <li className="rounded-2xl border border-hair bg-paper/[0.04]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-start active:bg-paper/[0.05]"
      >
        <SiteBadge host={site.host} name={name} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate text-base font-medium">{name}</span>
            <span className="shrink-0 text-base font-semibold tabular-nums">
              {formatDuration(site.seconds, t)}
            </span>
          </span>
          {meter ? (
            <span className="mt-2 block">
              <UsageMeter spentSeconds={site.seconds} policy={policy} compact />
              <span className="mt-1 block text-xs text-paper/55">
                {statusText(limitStatus(policy, site.seconds), t)}
              </span>
            </span>
          ) : (
            <Bar share={site.seconds / largest} />
          )}
        </span>
        <span aria-hidden="true" className={`text-paper/40 ${open ? "rotate-180" : ""}`}>
          <DownIcon />
        </span>
      </button>
      {open && (
        <div className="border-t border-hair px-4 py-3">
          <ul>
            {site.sections.map((section) => (
              <li key={section.section} className="py-1.5">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-paper/85">{sectionLabel(section.section, t)}</span>
                  <span className="shrink-0 text-paper/60 tabular-nums">
                    {formatDuration(section.seconds, t)}
                  </span>
                </span>
                <Bar share={section.seconds / site.seconds} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => openLimits(site.host)}
            className="mt-3 text-sm font-medium text-accent"
          >
            {policy ? t("stats.changeLimit") : t("stats.setLimit")}
          </button>
        </div>
      )}
    </li>
  );
}

/** Today against each site that has a limit, closest to its limit first; or an invitation to set one. */
function LimitsGlance() {
  const t = useT();
  const favorites = useFavorites();
  const policies = useUsageControl((s) => s.policies);
  const seconds = useUsageControl((s) => s.seconds);
  const setTab = useUsageView((s) => s.setTab);
  const entries = Object.entries(policies)
    .map(([host, policy]) => {
      const spent = usageSeconds(seconds, host);
      return { host, policy, spent, status: limitStatus(policy, spent) };
    })
    .filter((entry) => entry.status.state !== "none")
    .sort((a, b) => b.status.fraction - a.status.fraction);

  if (entries.length === 0) {
    return (
      <section className="mt-6 rounded-2xl border border-hair bg-paper/[0.04] p-4">
        <h2 className="text-base font-semibold">{t("stats.glanceEmptyTitle")}</h2>
        <p className="mt-1 text-sm leading-snug text-paper/60">{t("stats.glanceEmptyBody")}</p>
        <button type="button" onClick={() => setTab("limits")} className={`${primaryButton} mt-3`}>
          {t("stats.glanceEmptyAction")}
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={t("stats.glanceTitle")}
      className="mt-6 rounded-2xl border border-hair bg-paper/[0.04] p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("stats.glanceTitle")}</h2>
        <button
          type="button"
          onClick={() => setTab("limits")}
          className="text-sm font-medium text-accent"
        >
          {t("common.edit")}
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-4">
        {entries.slice(0, 4).map(({ host, policy, spent, status }) => (
          <li key={host}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium">{nameForHost(host, favorites)}</span>
              <span className="shrink-0 text-xs text-paper/60 tabular-nums">
                {t("usage.todayStatus", {
                  value: formatDuration(Math.floor(spent), t),
                  status: statusText(status, t),
                })}
              </span>
            </div>
            <UsageMeter spentSeconds={spent} policy={policy} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ClearStats({ onCleared }: { onCleared: () => void }) {
  const reportError = useApp((s) => s.reportError);
  const t = useT();
  const [confirming, setConfirming] = useState(false);

  const clear = () => {
    setConfirming(false);
    usage
      .clear()
      .then(() => {
        useUsageControl.setState({ seconds: {}, warning: null });
        onCleared();
      })
      .catch((error: unknown) => reportError(describeError(error, t)));
  };

  return confirming ? (
    <div className="mt-3 flex gap-3">
      <button type="button" onClick={clear} className={primaryButton}>
        {t("stats.clearAll")}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={quietButton}>
        {t("common.cancel")}
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className={`${quietButton} mt-3`}>
      {t("stats.clear")}
    </button>
  );
}

interface ActivityTabProps {
  days: number;
  onDays: (days: number) => void;
}

/** Time spent on each site and in each part of it, for today, a week or a month. */
export function ActivityTab({ days, onDays }: ActivityTabProps) {
  const favorites = useFavorites();
  const reportError = useApp((s) => s.reportError);
  const t = useT();
  const [report, setReport] = useState<UsageReport | null>(null);

  const load = useCallback(
    () =>
      settleUsageWrites()
        .then(() => usage.report(localDay(new Date()), days))
        .then(setReport)
        .catch((error: unknown) => reportError(describeError(error, t))),
    [days, reportError, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = (site: SiteUsage) => site.name ?? nameForHost(site.host, favorites);
  const largest = report?.sites[0]?.seconds ?? 1;
  const total = report?.totalSeconds ?? 0;

  return (
    <div>
      <div
        role="group"
        aria-label={t("stats.rangeLabel")}
        className="flex rounded-full bg-paper/[0.07] p-1"
      >
        {RANGES.map((range) => (
          <button
            key={range.days}
            type="button"
            aria-pressed={days === range.days}
            onClick={() => onDays(range.days)}
            className={`flex-1 rounded-full py-2 text-sm font-medium ${
              days === range.days ? "bg-accent text-on-accent" : "text-paper/70"
            }`}
          >
            {t(range.label)}
          </button>
        ))}
      </div>

      <p className="mt-6 px-1 text-xs font-medium tracking-[0.18em] text-paper/50 uppercase">
        {t("stats.timeOnSites")}
      </p>
      <p className="mt-1 px-1 text-5xl font-semibold tracking-tight tabular-nums">
        {formatDuration(total, t)}
      </p>
      {days > 1 && total > 0 && (
        <p className="mt-1 px-1 text-sm text-paper/55">
          {t("stats.averagePerDay", { value: formatDuration(Math.round(total / days), t) })}
        </p>
      )}

      <LimitsGlance />

      {report && report.sites.length === 0 ? (
        <p className="mt-6 px-1 text-sm leading-relaxed text-paper/55">{t("stats.empty")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2.5">
          {report?.sites.map((site) => (
            <SiteRow
              key={site.host}
              site={site}
              name={nameOf(site)}
              largest={largest}
              showLimit={days === 1}
            />
          ))}
        </ul>
      )}

      <section className="mt-8 rounded-2xl border border-hair p-4">
        <h2 className="text-sm font-semibold">{t("stats.privateTitle")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-paper/60">{t("stats.privateBody")}</p>
        <ClearStats onCleared={() => void load()} />
      </section>
    </div>
  );
}
