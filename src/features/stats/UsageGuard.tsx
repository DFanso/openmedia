import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appError, selectPage, useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import { primaryButton, quietButton } from "../settings/ui";
import { formatDuration, sectionLabel } from "./format";
import { limitStatus, secondsUntilMidnight } from "./limits";
import {
  limitReached,
  policyForHost,
  policyForSection,
  sectionUsageSeconds,
  usageLimitForTarget,
  usageSeconds,
  useUsageControl,
} from "./policy";
import { usageTargetOf } from "./section";
import { nameForHost, SiteBadge, useFavorites } from "./SiteBadge";
import { UsageMeter } from "./UsageMeter";
import { useEntitlementStore } from "../paywall/store";
import { openLimits } from "./view";

function rememberWarning(
  day: string,
  host: string,
  section: string | null,
  threshold: number,
): boolean {
  const key = `${host}:${section ?? "*"}:${threshold}`;
  try {
    const saved: { day: string; keys: string[] } = JSON.parse(
      localStorage.getItem("om.usage.warnings") ?? "null",
    ) ?? { day, keys: [] };
    const keys = saved.day === day && Array.isArray(saved.keys) ? saved.keys : [];
    if (keys.includes(key)) return false;
    localStorage.setItem("om.usage.warnings", JSON.stringify({ day, keys: [...keys, key] }));
  } catch {
    // The in-memory set below still prevents repeated notices if storage is unavailable.
  }
  return true;
}

function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** The heads-up shown over the page: how long today, how long is left, and a way to adjust it. */
function TimeCheck({ host, section }: { host: string; section: string | null }) {
  const t = useT();
  const favorites = useFavorites();
  const policies = useUsageControl((s) => s.policies);
  const sectionPolicies = useUsageControl((s) => s.sectionPolicies);
  const totals = useUsageControl((s) => s.seconds);
  const sectionTotals = useUsageControl((s) => s.sectionSeconds);
  const policy =
    section === null
      ? policyForHost(policies, host)
      : policyForSection(sectionPolicies, host, section);
  const spent =
    section === null
      ? usageSeconds(totals, host)
      : sectionUsageSeconds(sectionTotals, host, section);
  const status = limitStatus(policy, spent);
  const name = nameForHost(host, favorites);
  const targetName = section === null ? name : `${name} · ${sectionLabel(section, t)}`;
  return (
    <div
      data-hit=""
      role="status"
      className="usage-warning glass fixed inset-x-3 top-[calc(var(--safe-top)+12px)] z-30 rounded-2xl p-4"
    >
      <div className="flex items-center gap-3">
        <SiteBadge host={host} name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">
            {t("usage.timeCheck", { host: targetName })}
          </p>
          <p className="text-sm text-paper/70 tabular-nums">
            {status.untilLimit === null
              ? t("usage.todayValue", { value: formatDuration(Math.floor(spent), t) })
              : t("usage.pausesIn", {
                  value: formatDuration(Math.floor(spent), t),
                  left: formatDuration(status.untilLimit, t),
                })}
          </p>
        </div>
      </div>
      {status.untilLimit !== null && (
        <div className="mt-3">
          <UsageMeter spentSeconds={spent} policy={policy} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => openLimits(host, section ?? undefined)}
          className={primaryButton}
        >
          {t("usage.adjust")}
        </button>
        <button
          type="button"
          onClick={() => useUsageControl.setState({ warning: null })}
          className={quietButton}
        >
          {t("usage.dismiss")}
        </button>
      </div>
    </div>
  );
}

/** Covers every live session matching an exhausted target and says when it opens again. */
function LimitReached({
  host,
  section,
  seconds,
}: {
  host: string;
  section: string | null;
  seconds: number;
}) {
  const t = useT();
  const favorites = useFavorites();
  const openSheet = useApp((state) => state.openSheet);
  const now = useNow(30_000);
  const name = nameForHost(host, favorites);
  const targetName = section === null ? name : `${name} · ${sectionLabel(section, t)}`;
  return (
    <div
      data-hit=""
      className="fixed inset-0 z-10 grid place-items-center bg-ink/45 p-8 backdrop-blur-xl"
    >
      <section
        aria-label={t("usage.limitReachedLabel")}
        role="status"
        className="w-full max-w-sm rounded-3xl border border-hair bg-ink/90 p-6 text-center"
      >
        <div className="flex justify-center">
          <SiteBadge host={host} name={name} />
        </div>
        <h1 className="mt-4 text-xl font-semibold">{t("usage.limitReached")}</h1>
        <p className="mt-2 break-words text-sm leading-relaxed text-paper/70">
          {t("usage.pausedNotice", {
            name: targetName,
            value: formatDuration(Math.floor(seconds), t),
            left: formatDuration(secondsUntilMidnight(now), t),
          })}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => openLimits(host, section ?? undefined)}
            className={`${primaryButton} py-3`}
          >
            {t("usage.adjust")}
          </button>
          <button
            type="button"
            onClick={() => openSheet("stats")}
            className={`${quietButton} py-3`}
          >
            {t("usage.seeUsage")}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Whether today's limit has closed the current site or section in front. */
export function useLimitBlock() {
  const control = useUsageControl();
  const page = useApp(selectPage);
  const isPro = useEntitlementStore((state) => state.status === "pro");
  const target = page ? usageTargetOf(page.url ?? page.openedUrl, page.scope) : null;
  const limit =
    control.ready && target
      ? usageLimitForTarget(
          control.policies,
          control.sectionPolicies,
          control.seconds,
          control.sectionSeconds,
          target,
        )
      : undefined;
  return {
    control,
    isPro,
    target,
    host: target?.host,
    seconds: limit?.seconds ?? 0,
    section: limit?.section ?? null,
    blocked: isPro && control.ready && limit !== undefined,
  };
}

export function UsageGuard() {
  const { control, isPro, target, host, seconds, section, blocked } = useLimitBlock();
  const sessions = useApp((state) => state.sessions);
  const sheet = useApp((state) => state.sheet);
  const onboarding = useApp((state) => state.onboardingOpen);
  const reportError = useApp((state) => state.reportError);
  const requested = useRef(new Map<string, boolean>());
  const queues = useRef(new Map<string, Promise<unknown>>());
  const warned = useRef(new Set<string>());

  useEffect(() => {
    if (!control.ready) return;
    const live = new Set(sessions.map((session) => session.id));
    for (const id of requested.current.keys()) {
      if (!live.has(id)) {
        requested.current.delete(id);
        queues.current.delete(id);
      }
    }
    for (const session of sessions) {
      const sessionTarget = usageTargetOf(session.url ?? session.openedUrl, session.scope);
      const shouldBlock =
        isPro &&
        !!sessionTarget &&
        usageLimitForTarget(
          control.policies,
          control.sectionPolicies,
          control.seconds,
          control.sectionSeconds,
          sessionTarget,
        ) !== undefined;
      const previous = requested.current.get(session.id);
      if (previous === shouldBlock || (previous === undefined && !shouldBlock)) continue;
      requested.current.set(session.id, shouldBlock);
      const queued = (queues.current.get(session.id) ?? Promise.resolve())
        .then(() => invoke("set_usage_blocked", { session: session.id, blocked: shouldBlock }))
        .catch((error: unknown) => {
          if (requested.current.get(session.id) === shouldBlock)
            requested.current.delete(session.id);
          reportError(appError(error));
        });
      queues.current.set(session.id, queued);
    }
  }, [control, sessions, reportError, isPro]);

  const sitePolicy = target ? policyForHost(control.policies, target.host) : undefined;
  const siteSeconds = target ? usageSeconds(control.seconds, target.host) : 0;
  const partPolicy = target
    ? policyForSection(control.sectionPolicies, target.host, target.section)
    : undefined;
  const partSeconds = target
    ? sectionUsageSeconds(control.sectionSeconds, target.host, target.section)
    : 0;
  const warning = target
    ? [
        { policy: sitePolicy, seconds: siteSeconds, section: null },
        { policy: partPolicy, seconds: partSeconds, section: target.section },
      ].find(
        (candidate) =>
          candidate.policy?.warnSeconds != null &&
          candidate.seconds >= candidate.policy.warnSeconds &&
          !limitReached(candidate.policy, candidate.seconds),
      )
    : undefined;

  useEffect(() => {
    const threshold = warning?.policy?.warnSeconds;
    if (
      !isPro ||
      sheet !== "none" ||
      onboarding ||
      document.visibilityState !== "visible" ||
      !control.ready ||
      !host ||
      !warning ||
      threshold == null ||
      blocked
    )
      return;
    const key = `${control.day}:${host}:${warning.section ?? "*"}:${threshold}`;
    if (warned.current.has(key)) return;
    warned.current.add(key);
    if (rememberWarning(control.day, host, warning.section, threshold)) {
      useUsageControl.setState({
        warning: { host, section: warning.section, seconds: warning.seconds },
      });
    }
  }, [
    isPro,
    control.ready,
    control.day,
    host,
    target?.section,
    warning?.policy?.warnSeconds,
    warning?.section,
    warning?.seconds,
    blocked,
    sheet,
    onboarding,
  ]);

  useEffect(() => {
    if (!control.warning) return;
    const timer = window.setTimeout(() => useUsageControl.setState({ warning: null }), 8_000);
    return () => window.clearTimeout(timer);
  }, [control.warning]);

  const warningMatchesPage =
    control.warning !== null &&
    control.warning.host === host &&
    (control.warning.section === null || control.warning.section === target?.section);
  return (
    <>
      {control.warning && warningMatchesPage && !blocked && sheet === "none" && (
        <TimeCheck host={control.warning.host} section={control.warning.section} />
      )}
      {blocked && sheet === "none" && host && (
        <LimitReached host={host} section={section} seconds={seconds} />
      )}
    </>
  );
}
