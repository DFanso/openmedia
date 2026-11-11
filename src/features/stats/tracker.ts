import { useEntitlementStore } from "../paywall/store";
import { appError, useApp, selectPage, type AppStore } from "../../app/store";
import { usage } from "../../shared/ipc";
import { advance, createAccumulator, drain, type UsageEntry } from "./accumulator";
import { localDay } from "./format";
import { isUsageBlocked, usagePolicies, usageSectionPolicies, useUsageControl } from "./policy";
import { usageTargetOf, type UsageTarget } from "./section";

const TICK_MS = 1_000;
const FLUSH_SECONDS = 30;
let writes: Promise<unknown> = Promise.resolve();
let flushPending: (() => void) | undefined;

/** Includes time still in the current batch before a report is requested. */
export function settleUsageWrites(): Promise<unknown> {
  flushPending?.();
  return writes;
}

export function currentTarget(store: AppStore, visible: boolean): UsageTarget | null {
  if (!visible || store.sheet !== "none" || store.onboardingOpen) return null;
  const page = selectPage(store);
  const target = page?.url ? usageTargetOf(page.url, page.scope) : null;
  return target && !isUsageBlocked(target) ? target : null;
}

export function startUsageTracking(): () => void {
  let acc = createAccumulator(Date.now());
  let day = localDay(new Date());
  let pending: UsageEntry[] = [];
  let stopped = false;
  let stepping = false;
  let loading = false;
  const target = () =>
    useUsageControl.getState().ready
      ? currentTarget(useApp.getState(), document.visibilityState === "visible")
      : null;
  const fail = (error: unknown) => useApp.getState().reportError(appError(error));
  const isPro = () => useEntitlementStore.getState().status === "pro";

  const load = async () => {
    if (!isPro() || loading) return;
    loading = true;
    const requestedDay = day;
    try {
      await writes;
      const [policies, sectionPolicies, report] = await Promise.all([
        usagePolicies.get(),
        usageSectionPolicies.get(),
        usage.report(requestedDay, 1),
      ]);
      if (stopped || requestedDay !== day || !isPro()) return;
      useUsageControl.setState({
        day,
        policies,
        sectionPolicies,
        seconds: Object.fromEntries(report.sites.map((site) => [site.host, site.seconds])),
        sectionSeconds: Object.fromEntries(
          report.sites.map((site) => [
            site.host,
            Object.fromEntries(site.sections.map(({ section, seconds }) => [section, seconds])),
          ]),
        ),
        ready: true,
      });
    } catch (error) {
      if (isPro()) fail(error);
    } finally {
      loading = false;
    }
  };

  const flush = () => {
    if (pending.length === 0) return;
    const entries = pending;
    const recordedDay = day;
    pending = [];
    writes = writes.then(async () => {
      for (const entry of entries) {
        await usage.record(recordedDay, entry.host, entry.section, entry.seconds).catch(fail);
      }
    });
  };

  const collect = (now: number) => {
    acc = advance(acc, now, target());
    const { entries, rest } = drain(acc);
    acc = rest;
    if (entries.length === 0) return;
    pending.push(...entries);
    const control = useUsageControl.getState();
    const seconds = { ...control.seconds };
    const sectionSeconds = { ...control.sectionSeconds };
    for (const entry of entries) {
      seconds[entry.host] = (seconds[entry.host] ?? 0) + entry.seconds;
      sectionSeconds[entry.host] = {
        ...sectionSeconds[entry.host],
        [entry.section]: (sectionSeconds[entry.host]?.[entry.section] ?? 0) + entry.seconds,
      };
    }
    useUsageControl.setState({ seconds, sectionSeconds });
    // Re-evaluate after adding time so an exhausted site or section stops counting immediately.
    acc = { ...acc, target: target() };
  };

  const step = (flushAlways: boolean) => {
    if (stepping || stopped) return;
    stepping = true;
    const now = Date.now();
    const nextDay = localDay(new Date(now));
    if (nextDay !== day) {
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      const boundary = midnight.getTime();
      const crossesMidnight = boundary >= acc.lastAt && now - acc.lastAt <= 10_000;
      // Split an ordinary midnight tick between dates, without crediting a suspended night.
      if (crossesMidnight) collect(boundary);
      flush();
      day = nextDay;
      acc = createAccumulator(now);
      useUsageControl.setState({
        day,
        seconds: {},
        sectionSeconds: {},
        warning: null,
        ready: false,
      });
    }
    collect(now);
    if (flushAlways || pending.reduce((sum, entry) => sum + entry.seconds, 0) >= FLUSH_SECONDS)
      flush();
    stepping = false;
    if (isPro() && !useUsageControl.getState().ready) void load();
  };

  const onLeave = () => step(true);
  const timer = window.setInterval(() => step(false), TICK_MS);
  const unsubscribe = useApp.subscribe(onLeave);
  const unsubscribePolicies = useUsageControl.subscribe((next, previous) => {
    if (
      next.ready !== previous.ready ||
      next.policies !== previous.policies ||
      next.sectionPolicies !== previous.sectionPolicies
    )
      step(true);
  });
  const unsubscribeEntitlement = useEntitlementStore.subscribe((next, previous) => {
    if (next.status === previous.status) return;
    if (next.status === "pro") {
      void load();
    } else {
      useUsageControl.setState({
        policies: {},
        sectionPolicies: {},
        seconds: {},
        sectionSeconds: {},
        warning: null,
        ready: false,
      });
    }
  });
  flushPending = onLeave;
  document.addEventListener("visibilitychange", onLeave);
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("blur", onLeave);
  window.addEventListener("focus", onLeave);
  if (isPro()) void load();

  return () => {
    step(true);
    stopped = true;
    flushPending = undefined;
    window.clearInterval(timer);
    unsubscribe();
    unsubscribeEntitlement();
    unsubscribePolicies();
    document.removeEventListener("visibilitychange", onLeave);
    window.removeEventListener("pagehide", onLeave);
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("focus", onLeave);
  };
}
