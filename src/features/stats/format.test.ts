import { describe, expect, it } from "vitest";
import { createTranslator } from "../../i18n/translate";
import { formatDuration, localDay, sectionLabel } from "./format";

const t = createTranslator("en");

describe("formatDuration", () => {
  it("picks the coarsest useful unit", () => {
    expect(formatDuration(0, t)).toBe("0 s");
    expect(formatDuration(59, t)).toBe("59 s");
    expect(formatDuration(60, t)).toBe("1 min");
    expect(formatDuration(3599, t)).toBe("59 min");
    expect(formatDuration(3600, t)).toBe("1 h");
    expect(formatDuration(3600 + 25 * 60 + 40, t)).toBe("1 h 25 min");
  });
});

describe("sectionLabel", () => {
  it("names the root, the catch-all and segments", () => {
    expect(sectionLabel("/", t)).toBe("Home");
    expect(sectionLabel("*", t)).toBe("Other");
    expect(sectionLabel("/watch", t)).toBe("Watch");
    expect(sectionLabel("/direct_inbox", t)).toBe("Direct inbox");
  });
});

describe("localDay", () => {
  it("uses the local calendar date with zero padding", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDay(new Date(2026, 10, 8, 0, 0))).toBe("2026-11-08");
  });
});
