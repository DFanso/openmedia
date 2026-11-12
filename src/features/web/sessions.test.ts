import { describe, expect, it } from "vitest";
import {
  IDLE_LIMIT_MS,
  MAX_SESSIONS,
  applyState,
  findFavoriteSession,
  findTypedSession,
  newSession,
  scopeCovers,
  sessionsToClose,
  startSource,
  type Session,
  type SessionSource,
} from "./sessions";

const NOW = 10_000_000;

function session(id: string, source: SessionSource, overrides: Partial<Session> = {}): Session {
  return { ...newSession(id, source, `https://${id}.example/`, NOW), ...overrides };
}

describe("scopeCovers", () => {
  it("covers the domain and its subdomains", () => {
    expect(scopeCovers("instagram.com", "https://www.instagram.com/reels")).toBe(true);
    expect(scopeCovers("instagram.com", "https://instagram.com/")).toBe(true);
  });

  it("rejects lookalikes and unrelated hosts", () => {
    expect(scopeCovers("instagram.com", "https://notinstagram.com/")).toBe(false);
    expect(scopeCovers("instagram.com", "https://instagram.com.evil.io/")).toBe(false);
    expect(scopeCovers("instagram.com", "not a url")).toBe(false);
  });
});

describe("findFavoriteSession", () => {
  it("finds a live session on the favorite's site, whatever subdomain it is on", () => {
    const live = session("a", "typed", { scope: "youtube.com" });
    expect(findFavoriteSession([live], "https://m.youtube.com/")).toBe(live);
  });

  it("prefers a favorite session, then the most recently used", () => {
    const typed = session("a", "typed", { scope: "youtube.com", lastUsed: NOW });
    const older = session("b", "favorite", { scope: "youtube.com", lastUsed: NOW - 5 });
    const newer = session("c", "favorite", { scope: "youtube.com", lastUsed: NOW - 1 });
    expect(findFavoriteSession([typed, older, newer], "https://m.youtube.com/")).toBe(newer);
  });

  it("matches a session whose domain is still unknown only by its exact address", () => {
    const loading = session("a", "favorite", { openedUrl: "https://m.youtube.com/" });
    expect(findFavoriteSession([loading], "https://m.youtube.com/")).toBe(loading);
    expect(findFavoriteSession([loading], "https://www.reddit.com/")).toBeUndefined();
  });

  it("does not match another site", () => {
    const other = session("a", "favorite", { scope: "reddit.com" });
    expect(findFavoriteSession([other], "https://m.youtube.com/")).toBeUndefined();
  });

  it("keeps a hub page and a favorite on the same site apart", () => {
    const inbox = session("inbox", "hub", { scope: "instagram.com", hubId: "messages" });
    const feed = session("feed", "favorite", { scope: "instagram.com" });
    expect(findFavoriteSession([inbox], "https://www.instagram.com/")).toBeUndefined();
    expect(findFavoriteSession([inbox, feed], "https://www.instagram.com/")).toBe(feed);
    expect(
      findFavoriteSession([inbox, feed], "https://www.instagram.com/direct/", "messages"),
    ).toBe(inbox);
    expect(
      findFavoriteSession([feed], "https://www.instagram.com/direct/", "messages"),
    ).toBeUndefined();
  });

  it("keeps the pages of two hubs on the same site apart", () => {
    const first = session("a", "hub", { scope: "instagram.com", hubId: "first" });
    const second = session("b", "hub", { scope: "instagram.com", hubId: "second" });
    expect(findFavoriteSession([first, second], "https://www.instagram.com/", "second")).toBe(
      second,
    );
  });
});

describe("findTypedSession", () => {
  it("matches typed sessions opened with exactly that address", () => {
    const typed = session("a", "typed", { openedUrl: "https://a.example/" });
    const favorite = session("b", "favorite", { openedUrl: "https://a.example/" });
    expect(findTypedSession([favorite, typed], "https://a.example/")).toBe(typed);
    expect(findTypedSession([favorite], "https://a.example/")).toBeUndefined();
  });
});

describe("sessionsToClose", () => {
  const many = (count: number, source: SessionSource = "typed") =>
    Array.from({ length: count }, (_, i) => session(`s${i}`, source, { lastUsed: NOW - i }));

  it("keeps everything while under the cap and fresh", () => {
    expect(sessionsToClose(many(MAX_SESSIONS), "s0", NOW, "routine", [])).toEqual([]);
  });

  it("closes hidden sessions idle past the limit, never the visible one", () => {
    const stale = NOW - IDLE_LIMIT_MS - 1;
    const sessions = [
      session("visible", "typed", { lastUsed: stale }),
      session("old", "favorite", { lastUsed: stale }),
      session("fresh", "typed"),
    ];
    expect(sessionsToClose(sessions, "visible", NOW, "routine", [])).toEqual(["old"]);
  });

  it("closes the oldest typed sessions first when over the cap, sparing favorites", () => {
    const sessions = [
      session("fav-old", "favorite", { lastUsed: NOW - 100 }),
      session("typed-old", "typed", { lastUsed: NOW - 50 }),
      session("typed-new", "typed", { lastUsed: NOW - 10 }),
      session("fav-new", "favorite", { lastUsed: NOW - 5 }),
      session("visible", "typed", { lastUsed: NOW }),
      session("typed-mid", "typed", { lastUsed: NOW - 30 }),
    ];
    expect(sessionsToClose(sessions, "visible", NOW, "routine", [])).toEqual(["typed-old"]);
    const more = [...sessions, session("extra", "typed", { lastUsed: NOW - 1 })];
    expect(sessionsToClose(more, "visible", NOW, "routine", [])).toEqual([
      "typed-old",
      "typed-mid",
    ]);
  });

  it("does not double count sessions that are already idle against the cap", () => {
    const stale = NOW - IDLE_LIMIT_MS - 1;
    const sessions = [
      ...many(MAX_SESSIONS),
      session("idle-a", "typed", { lastUsed: stale }),
      session("idle-b", "typed", { lastUsed: stale }),
    ];
    expect(sessionsToClose(sessions, "s0", NOW, "routine", []).sort()).toEqual([
      "idle-a",
      "idle-b",
    ]);
  });

  it("keeps all six quick-access pages past the idle limit alongside a typed page", () => {
    const favorites = many(6, "favorite").map((page) => ({
      ...page,
      lastUsed: NOW - IDLE_LIMIT_MS - 1,
    }));
    const sessions = [...favorites, session("visible", "typed")];
    const urls = favorites.map((page) => ({ url: page.openedUrl }));
    expect(sessionsToClose(sessions, "visible", NOW, "routine", urls)).toEqual([]);
  });

  it("bounds extra browsing without evicting the six quick-access pages", () => {
    const favorites = many(6, "favorite");
    const sessions = [
      ...favorites,
      session("older", "typed", { lastUsed: NOW - 100 }),
      session("newer", "restored", { lastUsed: NOW - 50 }),
      session("visible", "typed"),
    ];
    const urls = favorites.map((page) => ({ url: page.openedUrl }));
    expect(sessionsToClose(sessions, "visible", NOW, "routine", urls)).toEqual(["older", "newer"]);
  });

  it("does not expand the budget for duplicate or unopened favorites", () => {
    const sessions = [
      session("chosen", "typed", { scope: "video.example", lastUsed: NOW - 100 }),
      ...many(6),
      session("visible", "typed"),
    ];
    const favorites = [
      { url: "https://video.example/" },
      { url: "https://m.video.example/" },
      { url: "https://unopened1.example/" },
      { url: "https://unopened2.example/" },
      { url: "https://unopened3.example/" },
      { url: "https://unopened4.example/" },
    ];
    expect(sessionsToClose(sessions, "visible", NOW, "routine", favorites)).toEqual([
      "s5",
      "s4",
      "s3",
    ]);
  });

  it("retains reusable typed and restored pages but not a lookalike domain", () => {
    const stale = NOW - IDLE_LIMIT_MS - 1;
    const sessions = [
      session("typed", "typed", { scope: "video.example", lastUsed: stale }),
      session("restored", "restored", { scope: "social.example", lastUsed: stale }),
      session("lookalike", "favorite", { scope: "notvideo.example", lastUsed: stale }),
      session("visible", "typed"),
    ];
    const favorites = [{ url: "https://m.video.example/" }, { url: "https://social.example/" }];
    expect(sessionsToClose(sessions, "visible", NOW, "routine", favorites)).toEqual(["lookalike"]);
  });

  it("retains only the favorite-tap target when quick-access entries share a site", () => {
    const stale = NOW - IDLE_LIMIT_MS - 1;
    const sessions = [
      session("typed", "typed", { scope: "video.example", lastUsed: stale }),
      session("older", "favorite", { scope: "video.example", lastUsed: stale - 10 }),
      session("chosen", "favorite", { scope: "video.example", lastUsed: stale }),
      session("visible", "typed"),
    ];
    const favorites = [{ url: "https://m.video.example/" }, { url: "https://www.video.example/" }];
    expect(sessionsToClose(sessions, "visible", NOW, "routine", favorites)).toEqual([
      "typed",
      "older",
    ]);
  });

  it("follows the current first six when favorites are reordered or removed", () => {
    const favorites = many(7, "favorite").map((page) => ({
      ...page,
      lastUsed: NOW - IDLE_LIMIT_MS - 1,
    }));
    const sessions = [...favorites, session("visible", "typed")];
    const urls = favorites.map((page) => ({ url: page.openedUrl }));
    expect(sessionsToClose(sessions, "visible", NOW, "routine", urls)).toEqual(["s6"]);
    expect(sessionsToClose(sessions, "visible", NOW, "routine", urls.slice(1))).toEqual(["s0"]);
    expect(sessionsToClose(sessions, "visible", NOW, "routine", [])).toEqual(
      favorites.map((page) => page.id),
    );
  });

  it("closes every hidden session on a memory warning and keeps the visible one", () => {
    const favorites = many(6, "favorite");
    const sessions = [...favorites, session("visible", "typed")];
    const urls = favorites.map((page) => ({ url: page.openedUrl }));
    expect(sessionsToClose(sessions, "visible", NOW, "memory", urls)).toEqual(
      favorites.map((page) => page.id),
    );
  });

  it("closes nothing visible when nothing is active", () => {
    expect(sessionsToClose(many(2), null, NOW, "memory", [])).toEqual(["s0", "s1"]);
  });
});

describe("applyState", () => {
  it("copies what the page reported and keeps the session's own identity", () => {
    const base = session("a", "favorite");
    const next = applyState(base, {
      session: "a",
      url: "https://x.com/home",
      title: "Home",
      loading: false,
      canGoBack: true,
      canGoForward: false,
      painted: true,
      scope: "x.com",
    });
    expect(next).toMatchObject({
      id: "a",
      source: "favorite",
      openedUrl: base.openedUrl,
      scope: "x.com",
      url: "https://x.com/home",
      loading: false,
      canGoBack: true,
    });
  });
});

describe("startSource", () => {
  const favorites = [{ url: "https://www.instagram.com/" }, { url: "https://m.youtube.com/" }];

  it("counts a startup page on a favorite's site as a favorite session", () => {
    expect(startSource(favorites, "https://www.instagram.com/")).toBe("favorite");
    expect(startSource(favorites, "https://m.youtube.com/watch?v=1")).toBe("favorite");
  });

  it("restores any other page as a plain restored session", () => {
    expect(startSource(favorites, "https://example.com/")).toBe("restored");
    expect(startSource([], "https://www.instagram.com/")).toBe("restored");
  });
});
