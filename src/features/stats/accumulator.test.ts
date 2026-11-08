import { describe, expect, it } from "vitest";
import {
  MAX_CREDIT_MS,
  MAX_RECORD_SECONDS,
  advance,
  createAccumulator,
  drain,
  pendingSeconds,
} from "./accumulator";

const watch = { host: "youtube.com", section: "/watch" };
const shorts = { host: "youtube.com", section: "/shorts" };

describe("advance", () => {
  it("credits elapsed time to the previous target", () => {
    let acc = advance(createAccumulator(0), 0, watch);
    acc = advance(acc, 5_000, watch);
    acc = advance(acc, 8_000, shorts);
    acc = advance(acc, 10_000, null);
    expect(drain(acc).entries).toEqual([
      { ...watch, seconds: 8 },
      { ...shorts, seconds: 2 },
    ]);
  });

  it("counts nothing while no page is in view", () => {
    let acc = advance(createAccumulator(0), 0, null);
    acc = advance(acc, 5_000, null);
    acc = advance(acc, 9_000, watch);
    expect(pendingSeconds(acc)).toBe(0);
  });

  it("never credits more than a tick window after a long gap", () => {
    let acc = advance(createAccumulator(0), 0, watch);
    acc = advance(acc, 3_600_000, null);
    expect(drain(acc).entries).toEqual([{ ...watch, seconds: MAX_CREDIT_MS / 1000 }]);
  });

  it("ignores a clock that went backwards", () => {
    let acc = advance(createAccumulator(10_000), 10_000, watch);
    acc = advance(acc, 4_000, watch);
    expect(pendingSeconds(acc)).toBe(0);
    acc = advance(acc, 6_000, null);
    expect(pendingSeconds(acc)).toBe(2);
  });
});

describe("drain", () => {
  it("keeps the fraction of a second for later", () => {
    let acc = advance(createAccumulator(0), 0, watch);
    acc = advance(acc, 1_600, watch);
    const first = drain(acc);
    expect(first.entries).toEqual([{ ...watch, seconds: 1 }]);
    const second = drain(advance(first.rest, 2_400, null));
    expect(second.entries).toEqual([{ ...watch, seconds: 1 }]);
  });

  it("empties once drained", () => {
    let acc = advance(createAccumulator(0), 0, watch);
    acc = advance(acc, 4_000, null);
    expect(drain(drain(acc).rest).entries).toEqual([]);
  });

  it("caps one entry at what Rust accepts and keeps the rest", () => {
    const big = {
      target: null,
      lastAt: 0,
      pending: [{ ...watch, ms: (MAX_RECORD_SECONDS + 5) * 1000 }],
    };
    const { entries, rest } = drain(big);
    expect(entries).toEqual([{ ...watch, seconds: MAX_RECORD_SECONDS }]);
    expect(pendingSeconds(rest)).toBe(5);
  });
});
