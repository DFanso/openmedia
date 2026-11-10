import { afterEach, describe, expect, it } from "vitest";

import type { Favorite } from "./ipc";
import {
  hasBundledIcon,
  faviconPageUrlForHost,
  iconForUrl,
  setIconCache,
  urlsWithoutBundledIcon,
  useIconCache,
} from "./siteIcons";

/** The official recipes, read as data: the test checks the icons against them. */
const RECIPES = import.meta.glob("../../recipes/official/*.json", {
  eager: true,
  import: "default",
}) as Record<string, { id: string; meta: { homepage: string }; match: string[] }>;

afterEach(() => useIconCache.getState().setIcons({}));

describe("the icons that ship with the app", () => {
  it("covers every recipe homepage and matching alias without network access", () => {
    for (const recipe of Object.values(RECIPES)) {
      const hosts = new Set([
        new URL(recipe.meta.homepage).hostname,
        ...recipe.match.map((pattern) => new URL(pattern).hostname.replace(/^\*\./, "")),
      ]);
      for (const host of hosts) {
        expect(hasBundledIcon(host), `${recipe.id}: no icon for ${host}`).toBe(true);
      }
    }
  });
});

describe("iconForUrl", () => {
  it("gives the icon the app fetched from the site", () => {
    setIconCache({ "fetched.example": "data:image/png;base64,AA" });
    expect(iconForUrl("https://fetched.example/page", [])).toBe("data:image/png;base64,AA");
  });

  it("gives the icon of a favorite on the same site", () => {
    const favorites: Favorite[] = [
      {
        id: "1",
        name: "Favorite",
        url: "https://favorite.example/",
        icon: "data:image/png;base64,BB",
        notify: true,
      },
    ];
    expect(iconForUrl("https://www.favorite.example/page", favorites)).toBe(
      "data:image/png;base64,BB",
    );
  });

  it("has nothing for a site it does not know", () => {
    expect(iconForUrl("https://unknown.example/", [])).toBeUndefined();
    expect(iconForUrl("not a url", [])).toBeUndefined();
  });
});

describe("urlsWithoutBundledIcon", () => {
  it("leaves out the sites that ship with an icon", () => {
    expect(urlsWithoutBundledIcon(["https://www.youtube.com/", "https://mine.example/"])).toEqual([
      "https://mine.example/",
    ]);
  });
});
describe("faviconPageUrlForHost", () => {
  it("builds HTTPS page URLs from DNS hosts and wildcard recipe matches", () => {
    expect(faviconPageUrlForHost("example.com")).toBe("https://example.com/");
    expect(faviconPageUrlForHost("*.www.example.com")).toBe("https://www.example.com/");
    expect(faviconPageUrlForHost("XN--P1AI.example")).toBe("https://xn--p1ai.example/");
  });

  it("rejects URLs, local names, IPs and malformed hosts", () => {
    for (const host of [
      "localhost",
      "127.0.0.1",
      "https://example.com",
      "example.com/path",
      "example..com",
      "*.com",
    ]) {
      expect(faviconPageUrlForHost(host), host).toBeUndefined();
    }
    expect(faviconPageUrlForHost(undefined)).toBeUndefined();
  });
});
