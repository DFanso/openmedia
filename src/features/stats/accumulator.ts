import type { UsageTarget } from "./section";

/** Wall-clock time credited for one step at most, so a suspended app never banks its sleep. */
export const MAX_CREDIT_MS = 10_000;
/** Never hand Rust more than it accepts in one record. */
export const MAX_RECORD_SECONDS = 3600;

interface Pending extends UsageTarget {
  ms: number;
}

/** Time waiting to be written, and where the user was when the clock last advanced. */
export interface Accumulator {
  target: UsageTarget | null;
  lastAt: number;
  pending: Pending[];
}

export interface UsageEntry extends UsageTarget {
  seconds: number;
}

export function createAccumulator(now: number): Accumulator {
  return { target: null, lastAt: now, pending: [] };
}

const same = (a: UsageTarget, b: UsageTarget) => a.host === b.host && a.section === b.section;

/**
 * Moves the clock to `now`. The time since the last call is credited to the previous target,
 * never more than `MAX_CREDIT_MS` and never negative; `target` is where the user is from now on,
 * or `null` when no page is in view.
 */
export function advance(acc: Accumulator, now: number, target: UsageTarget | null): Accumulator {
  const credit = Math.min(Math.max(now - acc.lastAt, 0), MAX_CREDIT_MS);
  const previous = acc.target;
  if (!previous || credit === 0) return { ...acc, target, lastAt: now };
  const found = acc.pending.some((entry) => same(entry, previous));
  const pending = found
    ? acc.pending.map((entry) =>
        same(entry, previous) ? { ...entry, ms: entry.ms + credit } : entry,
      )
    : [...acc.pending, { ...previous, ms: credit }];
  return { target, lastAt: now, pending };
}

export function pendingSeconds(acc: Accumulator): number {
  return Math.floor(acc.pending.reduce((sum, entry) => sum + entry.ms, 0) / 1000);
}

/** Takes the whole seconds out, leaving fractions of a second behind. */
export function drain(acc: Accumulator): { entries: UsageEntry[]; rest: Accumulator } {
  const entries: UsageEntry[] = [];
  const pending: Pending[] = [];
  for (const { host, section, ms } of acc.pending) {
    const seconds = Math.min(Math.floor(ms / 1000), MAX_RECORD_SECONDS);
    if (seconds > 0) entries.push({ host, section, seconds });
    const left = ms - seconds * 1000;
    if (left > 0) pending.push({ host, section, ms: left });
  }
  return { entries, rest: { ...acc, pending } };
}
