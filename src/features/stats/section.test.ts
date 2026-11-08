import { describe, expect, it } from "vitest";
import { HOME_SECTION, OTHER_SECTION, sectionOf, usageTargetOf } from "./section";

describe("sectionOf", () => {
  it("keeps the first path segment, lowercased", () => {
    expect(sectionOf("/watch")).toBe("/watch");
    expect(sectionOf("/Shorts/abc123")).toBe("/shorts");
    expect(sectionOf("/reels/")).toBe("/reels");
    expect(sectionOf("/direct_inbox-2")).toBe("/direct_inbox-2");
  });

  it("calls an empty path home", () => {
    expect(sectionOf("")).toBe(HOME_SECTION);
    expect(sectionOf("/")).toBe(HOME_SECTION);
    expect(sectionOf("//x")).toBe(HOME_SECTION);
  });

  it("files handles, ids and odd text under other", () => {
    expect(sectionOf("/@someone")).toBe(OTHER_SECTION);
    expect(sectionOf("/1234567")).toBe(OTHER_SECTION);
    expect(sectionOf("/%E3%83%86%E3%82%B9%E3%83%88")).toBe(OTHER_SECTION);
    expect(sectionOf("/with.dot")).toBe(OTHER_SECTION);
    expect(sectionOf("/with%20space")).toBe(OTHER_SECTION);
    expect(sectionOf(`/${"a".repeat(25)}`)).toBe(OTHER_SECTION);
  });

  it("accepts a segment of exactly 24 characters", () => {
    expect(sectionOf(`/${"a".repeat(24)}`)).toBe(`/${"a".repeat(24)}`);
  });
});

describe("usageTargetOf", () => {
  it("uses the scope when known and drops query and fragment", () => {
    expect(usageTargetOf("https://m.youtube.com/watch?v=secret#t=5", "youtube.com")).toEqual({
      host: "youtube.com",
      section: "/watch",
    });
  });

  it("falls back to the host", () => {
    expect(usageTargetOf("https://Example.com/", null)).toEqual({
      host: "example.com",
      section: "/",
    });
  });

  it("ignores addresses that are not web pages", () => {
    expect(usageTargetOf("about:blank", null)).toBeNull();
    expect(usageTargetOf("not a url", null)).toBeNull();
    expect(usageTargetOf("https://[::1]/x", null)).toBeNull();
  });
});
