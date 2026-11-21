import { describe, expect, it } from "vitest";
import type { Favorite, SiteUsage } from "../../shared/ipc";
import type { Session } from "./sessions";
import { pickWarmFavorites } from "./warm";

const favorite = (name: string, url: string): Favorite => ({
  id: name,
  name,
  url,
  notify: false,
});
const used = (host: string, seconds: number): SiteUsage => ({
  host,
  name: null,
  seconds,
  sections: [],
});
const live = (url: string): Session =>
  ({
    id: url,
    source: "favorite",
    hubId: null,
    openedUrl: url,
    scope: new URL(url).hostname.replace(/^www\./, ""),
    url,
  }) as Session;

const FAVORITES = [
  favorite("YouTube", "https://www.youtube.com/"),
  favorite("Instagram", "https://www.instagram.com/"),
  favorite("Reddit", "https://www.reddit.com/"),
  favorite("LinkedIn", "https://www.linkedin.com/"),
];

describe("pickWarmFavorites", () => {
  it("picks the most used sites that are not open yet", () => {
    const picked = pickWarmFavorites(
      FAVORITES,
      [live("https://www.instagram.com/")],
      [used("www.reddit.com", 900), used("www.linkedin.com", 60), used("m.youtube.com", 300)],
    );
    expect(picked.map((f) => f.name)).toEqual(["Reddit", "YouTube"]);
  });

  it("adds up the hosts of one site and keeps the reader's order without any use", () => {
    expect(
      pickWarmFavorites(
        FAVORITES,
        [],
        [used("www.linkedin.com", 10), used("linkedin.com", 10)],
      ).map((f) => f.name),
    ).toEqual(["LinkedIn", "YouTube"]);
    expect(pickWarmFavorites(FAVORITES, [], []).map((f) => f.name)).toEqual([
      "YouTube",
      "Instagram",
    ]);
  });

  it("never picks a site twice or one that is already open", () => {
    const twice = [...FAVORITES, favorite("Reddit again", "https://www.reddit.com/r/all")];
    const picked = pickWarmFavorites(twice, [live("https://www.youtube.com/")], [], 10);
    expect(picked.map((f) => f.name)).toEqual(["Instagram", "Reddit", "LinkedIn"]);
  });
});
