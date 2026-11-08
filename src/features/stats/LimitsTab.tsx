import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { useApp } from "../../app/store";
import type { Translate } from "../../i18n/translate";
import { useT } from "../../i18n/useT";
import { DownIcon, PlusIcon } from "../../shared/icons";
import { Group, GroupLabel, field, primaryButton } from "../settings/ui";
import { formatDuration } from "./format";
import {
  hostFor,
  limitSites,
  limitStatus,
  suggestHosts,
  thresholdsOf,
  type LimitSite,
} from "./limits";
import { LimitEditor } from "./LimitEditor";
import { usageSeconds, useUsageControl, type UsagePolicy } from "./policy";
import { SiteBadge } from "./SiteBadge";
import { useUsageView } from "./view";

const NO_HISTORY: string[] = [];

function summaryOf(policy: UsagePolicy | undefined, t: Translate): string {
  const { warn, limit } = thresholdsOf(policy);
  const limitText = limit === null ? "" : formatDuration(limit * 60, t);
  const warnText = warn === null ? "" : formatDuration(warn * 60, t);
  if (limit !== null && warn !== null) {
    return t("usage.summaryBoth", { limit: limitText, warn: warnText });
  }
  if (limit !== null) return t("usage.summaryLimit", { limit: limitText });
  if (warn !== null) return t("usage.summaryWarn", { warn: warnText });
  return t("usage.summaryNone");
}

function StatusChip({ policy, spent }: { policy: UsagePolicy | undefined; spent: number }) {
  const t = useT();
  const status = limitStatus(policy, spent);
  if (status.state === "none") return null;
  const reached = status.state === "reached";
  const text = reached
    ? t("usage.chipPaused")
    : status.untilLimit !== null
      ? t("usage.statusLeft", { value: formatDuration(status.untilLimit, t) })
      : status.untilWarn === 0
        ? t("usage.chipReminded")
        : "";
  if (!text) return null;
  const tone = reached
    ? "bg-red-400/15 text-red-500"
    : status.state === "warned"
      ? "bg-amber-400/15 text-amber-500"
      : "bg-paper/[0.08] text-paper/70";
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${tone}`}>
      {text}
    </span>
  );
}

interface LimitRowProps {
  site: LimitSite;
  policy: UsagePolicy | undefined;
  spent: number;
  open: boolean;
  scrollTo: boolean;
  onToggle: () => void;
}

function LimitRow({ site, policy, spent, open, scrollTo, onToggle }: LimitRowProps) {
  const t = useT();
  const row = useRef<HTMLDivElement>(null);
  const name = site.name ?? site.host;

  useEffect(() => {
    if (scrollTo) row.current?.scrollIntoView({ block: "start" });
  }, [scrollTo]);

  return (
    <div ref={row} className="scroll-mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-start active:bg-paper/[0.05]"
      >
        <SiteBadge host={site.host} name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{name}</span>
          <span className="block text-sm leading-snug text-paper/55">{summaryOf(policy, t)}</span>
        </span>
        <StatusChip policy={policy} spent={spent} />
        <span aria-hidden="true" className={`text-paper/45 ${open ? "rotate-180" : ""}`}>
          <DownIcon />
        </span>
      </button>
      {open && <LimitEditor host={site.host} policy={policy} spentSeconds={spent} />}
    </div>
  );
}

interface AddSiteProps {
  suggestions: string[];
  onAdd: (host: string) => void;
}

function AddSite({ suggestions, onAdd }: AddSiteProps) {
  const t = useT();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const host = hostFor(value);
    if (!host) {
      setError(t("usage.invalidAddress"));
      return;
    }
    setValue("");
    setError("");
    onAdd(host);
  };

  return (
    <div>
      <form onSubmit={submit} className="flex items-start gap-2">
        <input
          aria-label={t("usage.siteAddress")}
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError("");
          }}
          placeholder="example.com"
          dir="ltr"
          className={`${field} text-start`}
        />
        <button type="submit" className={`${primaryButton} h-[46px] shrink-0`}>
          {t("usage.add")}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 px-1 text-sm text-red-500">
          {error}
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((host) => (
            <button
              key={host}
              type="button"
              onClick={() => onAdd(host)}
              className="flex items-center gap-1.5 rounded-full border border-hair py-1.5 ps-2.5 pe-3.5 text-sm text-paper/85 active:bg-paper/[0.08]"
            >
              <PlusIcon />
              {host}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Every favorite with its daily limit one tap away, then the other sites that have one. */
export function LimitsTab() {
  const t = useT();
  const favorites = useApp((s) => s.state?.favorites);
  const history = useApp((s) => s.state?.history) ?? NO_HISTORY;
  const policies = useUsageControl((s) => s.policies);
  const seconds = useUsageControl((s) => s.seconds);
  const focusHost = useUsageView((s) => s.focusHost);
  const [open, setOpen] = useState<string | null>(focusHost);
  const [scrollTo] = useState<string | null>(focusHost);
  const [added, setAdded] = useState<string[]>(focusHost ? [focusHost] : []);

  useEffect(() => {
    useUsageView.getState().clearFocus();
  }, []);

  const sites = useMemo(
    () => limitSites(favorites ?? [], policies, added),
    [favorites, policies, added],
  );
  const suggestions = useMemo(() => {
    const taken = new Set([...sites.favorites, ...sites.others].map((site) => site.host));
    return suggestHosts(history, seconds, taken);
  }, [history, seconds, sites]);

  const renderRow = (site: LimitSite) => (
    <LimitRow
      key={site.host}
      site={site}
      policy={policies[site.host]}
      spent={usageSeconds(seconds, site.host)}
      open={open === site.host}
      scrollTo={scrollTo === site.host}
      onToggle={() => setOpen(open === site.host ? null : site.host)}
    />
  );

  const add = (host: string) => {
    setAdded((current) => (current.includes(host) ? current : [...current, host]));
    setOpen(host);
  };

  return (
    <div className="flex flex-col gap-7">
      <p className="px-1 text-sm leading-relaxed text-paper/60">{t("usage.limitsIntro")}</p>

      <section>
        <GroupLabel>{t("usage.groupFavorites")}</GroupLabel>
        {sites.favorites.length > 0 ? (
          <Group>{sites.favorites.map(renderRow)}</Group>
        ) : (
          <p className="px-1 text-sm text-paper/50">{t("usage.noFavorites")}</p>
        )}
      </section>

      {sites.others.length > 0 && (
        <section>
          <GroupLabel>{t("usage.groupOther")}</GroupLabel>
          <Group>{sites.others.map(renderRow)}</Group>
        </section>
      )}

      <section>
        <GroupLabel>{t("usage.groupAdd")}</GroupLabel>
        <AddSite suggestions={suggestions} onAdd={add} />
      </section>
    </div>
  );
}
