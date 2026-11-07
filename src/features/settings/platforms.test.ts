import { describe, expect, it } from "vitest";
import { normalizeWebUrl } from "../../shared/url";
import { MAX_FAVORITE_NAME } from "./presets";
import { isPlatformUrl, PLATFORMS, type Platform } from "./platforms";

const byId = (id: string): Platform => {
  const platform = PLATFORMS.find((p) => p.id === id);
  if (!platform) throw new Error(`no platform ${id}`);
  return platform;
};

describe("platform catalog", () => {
  it("every entry can be saved as a favorite unchanged", () => {
    for (const platform of PLATFORMS) {
      expect(normalizeWebUrl(platform.url), platform.id).toBe(platform.url);
      expect(platform.name.length, platform.id).toBeLessThanOrEqual(MAX_FAVORITE_NAME);
    }
  });

  it("ids, names and addresses are unique, and each address belongs to its own platform", () => {
    expect(new Set(PLATFORMS.map((p) => p.id)).size).toBe(PLATFORMS.length);
    expect(new Set(PLATFORMS.map((p) => p.name)).size).toBe(PLATFORMS.length);
    for (const platform of PLATFORMS) {
      expect(isPlatformUrl(platform, platform.url), platform.id).toBe(true);
      const others = PLATFORMS.filter((p) => p !== platform);
      expect(
        others.filter((other) => isPlatformUrl(other, platform.url)).map((p) => p.id),
        platform.id,
      ).toEqual([]);
    }
  });

  it("a favorite saved before the catalog existed still counts as added", () => {
    expect(isPlatformUrl(byId("x"), "https://twitter.com/")).toBe(true);
    expect(isPlatformUrl(byId("facebook"), "https://m.facebook.com/?wtsid=1")).toBe(true);
    expect(isPlatformUrl(byId("youtube"), "https://www.youtube.com/")).toBe(true);
  });

  it("matches subdomains only, never lookalike hosts", () => {
    const reddit = byId("reddit");
    expect(isPlatformUrl(reddit, "https://old.reddit.com/r/x")).toBe(true);
    expect(isPlatformUrl(reddit, "https://notreddit.com/")).toBe(false);
    expect(isPlatformUrl(reddit, "https://reddit.com.evil.example/")).toBe(false);
    expect(isPlatformUrl(reddit, "not a url")).toBe(false);
  });
});
