import { describe, expect, it } from "vitest";
import { PRESETS } from "./presets";

describe("provider presets", () => {
  const hosted = PRESETS.filter((p) => p.baseUrl !== "");

  it("hosted presets use https and have no trailing slash", () => {
    for (const preset of hosted) {
      expect(preset.baseUrl.startsWith("https://"), preset.id).toBe(true);
      expect(preset.baseUrl.endsWith("/"), preset.id).toBe(false);
    }
  });

  it("ids are unique and there is exactly one blank custom entry", () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(PRESETS.filter((p) => p.baseUrl === "")).toHaveLength(1);
  });
});
