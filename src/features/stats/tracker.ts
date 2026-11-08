import { useApp, selectPage, type AppStore } from "../../app/store";
import { usage } from "../../shared/ipc";
import { advance, createAccumulator, drain, pendingSeconds } from "./accumulator";
import { localDay } from "./format";
import { usageTargetOf, type UsageTarget } from "./section";

const TICK_MS = 5_000;
/** Seconds that pile up before they are written; switching away or hiding writes sooner. */
const FLUSH_SECONDS = 30;

let writes: Promise<unknown> = Promise.resolve();

/** Resolves once every usage write started so far has finished, so a report includes them. */
export const settleUsageWrites = () => writes;

/** What the user is looking at right now: a site page with no sheet in front of it. */
export function currentTarget(store: AppStore, visible: boolean): UsageTarget | null {
  if (!visible || store.sheet !== "none" || store.onboardingOpen) return null;
  const page = selectPage(store);
  return page?.url ? usageTargetOf(page.url, page.scope) : null;
}

const targetKey = (target: UsageTarget | null) => (target ? `${target.host}${target.section}` : "");

/**
 * Counts the seconds the user spends on a site page while the app is in the foreground, and
 * writes them to Rust in batches. Returns the function that stops it.
 */
export function startUsageTracking(): () => void {
  let acc = createAccumulator(Date.now());
  const target = () => currentTarget(useApp.getState(), document.visibilityState === "visible");

  const flush = () => {
    const { entries, rest } = drain(acc);
    acc = rest;
    if (entries.length === 0) return;
    const day = localDay(new Date());
    writes = Promise.all([
      writes,
      ...entries.map((entry) =>
        usage.record(day, entry.host, entry.section, entry.seconds).catch(() => {}),
      ),
    ]);
  };

  const step = (flushAlways: boolean) => {
    acc = advance(acc, Date.now(), target());
    if (flushAlways || pendingSeconds(acc) >= FLUSH_SECONDS) flush();
  };

  const onLeave = () => step(true);
  const timer = window.setInterval(() => step(false), TICK_MS);
  let lastKey = targetKey(target());
  const unsubscribe = useApp.subscribe(() => {
    const key = targetKey(target());
    if (key === lastKey) return;
    lastKey = key;
    step(true);
  });
  document.addEventListener("visibilitychange", onLeave);
  window.addEventListener("pagehide", onLeave);
  window.addEventListener("blur", onLeave);
  window.addEventListener("focus", onLeave);

  return () => {
    window.clearInterval(timer);
    unsubscribe();
    document.removeEventListener("visibilitychange", onLeave);
    window.removeEventListener("pagehide", onLeave);
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("focus", onLeave);
    step(true);
  };
}
