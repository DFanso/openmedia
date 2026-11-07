import { describe, expect, it } from "vitest";
import { formatDuration, localDay, sectionLabel } from "./format";

describe("formatDuration", () => {
  it("picks the coarsest useful unit", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(3599)).toBe("59m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3600 + 25 * 60 + 40)).toBe("1h 25m");
  });
});

describe("sectionLabel", () => {
  it("names the root, the catch-all and segments", () => {
    expect(sectionLabel("/")).toBe("Home");
    expect(sectionLabel("*")).toBe("Other");
    expect(sectionLabel("/watch")).toBe("Watch");
    expect(sectionLabel("/direct_inbox")).toBe("Direct inbox");
  });
});

describe("localDay", () => {
  it("uses the local calendar date with zero padding", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDay(new Date(2026, 10, 8, 0, 0))).toBe("2026-11-08");
  });
});
