import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { selectPage, useApp } from "../../app/store";
import { describeError } from "../../i18n/errors";
import { useT } from "../../i18n/useT";
import { formatDuration } from "./format";
import { limitReached, policyForHost, usageSeconds, useUsageControl } from "./policy";
import { usageTargetOf } from "./section";

function rememberWarning(day: string, host: string, threshold: number): boolean {
  const key = `${host}:${threshold}`;
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

export function UsageGuard() {
  const control = useUsageControl();
  const page = useApp(selectPage);
  const sessions = useApp((state) => state.sessions);
  const sheet = useApp((state) => state.sheet);
  const onboarding = useApp((state) => state.onboardingOpen);
  const reportError = useApp((state) => state.reportError);
  const openSheet = useApp((state) => state.openSheet);
  const t = useT();
  const requested = useRef(new Map<string, boolean>());
  const queues = useRef(new Map<string, Promise<unknown>>());
  const warned = useRef(new Set<string>());
  const host = page ? usageTargetOf(page.url ?? page.openedUrl, page.scope)?.host : undefined;
  const seconds = host ? usageSeconds(control.seconds, host) : 0;
  const policy = host ? policyForHost(control.policies, host) : undefined;
  const blocked = control.ready && limitReached(policy, seconds);

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
      const target = usageTargetOf(session.url ?? session.openedUrl, session.scope);
      const shouldBlock =
        !!target &&
        limitReached(
          policyForHost(control.policies, target.host),
          usageSeconds(control.seconds, target.host),
        );
      const previous = requested.current.get(session.id);
      if (previous === shouldBlock || (previous === undefined && !shouldBlock)) continue;
      requested.current.set(session.id, shouldBlock);
      const queued = (queues.current.get(session.id) ?? Promise.resolve())
        .then(() => invoke("set_usage_blocked", { session: session.id, blocked: shouldBlock }))
        .catch((error: unknown) => {
          if (requested.current.get(session.id) === shouldBlock)
            requested.current.delete(session.id);
          reportError(describeError(error, t));
        });
      queues.current.set(session.id, queued);
    }
  }, [control, sessions, reportError, t]);

  useEffect(() => {
    const threshold = policy?.warnSeconds;
    if (sheet !== "none" || onboarding || document.visibilityState !== "visible") return;
    if (!control.ready || !host || threshold == null || seconds < threshold || blocked) return;
    const key = `${control.day}:${host}:${threshold}`;
    if (warned.current.has(key)) return;
    warned.current.add(key);
    if (rememberWarning(control.day, host, threshold)) {
      useUsageControl.setState({ warning: { host, seconds } });
    }
  }, [control.ready, control.day, host, policy?.warnSeconds, seconds, blocked, sheet, onboarding]);

  useEffect(() => {
    if (!control.warning) return;
    const timer = window.setTimeout(() => useUsageControl.setState({ warning: null }), 8_000);
    return () => window.clearTimeout(timer);
  }, [control.warning]);

  return (
    <>
      {control.warning && !blocked && sheet === "none" && (
        <div
          data-hit=""
          role="status"
          className="usage-warning glass fixed inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-30 rounded-2xl p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {t("usage.timeCheck", { host: control.warning.host })}
              </p>
              <p className="mt-1 text-sm text-paper/65">
                {t("usage.spentToday", { value: formatDuration(control.warning.seconds, t) })}
              </p>
            </div>
            <button
              type="button"
              aria-label={t("usage.dismissLabel")}
              onClick={() => useUsageControl.setState({ warning: null })}
              className="px-2 py-1 text-paper/65"
            >
              {t("usage.dismiss")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => openSheet("stats")}
            className="mt-3 text-sm font-medium text-accent"
          >
            {t("usage.manage")}
          </button>
        </div>
      )}
      {blocked && sheet === "none" && (
        <div
          data-hit=""
          className="fixed inset-0 z-10 grid place-items-center bg-ink/45 p-8 backdrop-blur-xl"
        >
          <section
            aria-label={t("usage.limitReachedLabel")}
            role="status"
            className="max-w-sm rounded-3xl border border-hair bg-ink/90 p-6 text-center"
          >
            <h1 className="text-xl font-semibold">{t("usage.limitReached")}</h1>
            <p className="mt-3 break-words text-sm text-paper/70">
              {t("usage.paused", { host: host ?? "", value: formatDuration(seconds, t) })}
            </p>
            <button
              type="button"
              onClick={() => openSheet("stats")}
              className="mt-5 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-on-accent"
            >
              {t("usage.manage")}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
