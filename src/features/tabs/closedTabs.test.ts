import { describe, expect, it } from "vitest";
import { applyState, newSession, type Session } from "../web/sessions";
import { MAX_CLOSED_TABS, closedTabFrom, rememberClosed, withoutClosed } from "./closedTabs";

const session = (id: string, url = `https://${id}.example/`): Session =>
  newSession(id, "typed", url, 1);

const browsed = (id: string, url: string, title: string): Session =>
  applyState(session(id), {
    session: id,
    scope: "example",
    url,
    title,
    loading: false,
    canGoBack: true,
    canGoForward: false,
    playing: false,
    painted: true,
  });

describe("closedTabFrom", () => {
  it("keeps the page the session was on, not the one it opened with", () => {
    expect(closedTabFrom(browsed("a", "https://a.example/post/1", " A post "), 50)).toEqual({
      id: "a",
      url: "https://a.example/post/1",
      title: "A post",
      source: "typed",
      hubId: null,
      closedAt: 50,
    });
  });

  it("falls back to the opening address while the page has not loaded", () => {
    const tab = closedTabFrom(session("a"), 5);
    expect(tab.url).toBe("https://a.example/");
    expect(tab.title).toBeNull();
  });
});

describe("rememberClosed", () => {
  it("lists the newest first", () => {
    const first = rememberClosed([], [session("a")], 1);
    expect(rememberClosed(first, [session("b")], 2).map((tab) => tab.id)).toEqual(["b", "a"]);
  });

  it("moves a page closed again to the top instead of listing it twice", () => {
    const list = rememberClosed([], [session("a"), session("b")], 1);
    const again = rememberClosed(list, [session("c", "https://a.example/")], 2);
    expect(again.map((tab) => tab.id)).toEqual(["c", "b"]);
  });

  it(`keeps at most ${MAX_CLOSED_TABS}`, () => {
    const many = Array.from({ length: MAX_CLOSED_TABS + 3 }, (_, i) => session(`s${i}`));
    const list = rememberClosed([], many, 1);
    expect(list).toHaveLength(MAX_CLOSED_TABS);
    expect(list[0].id).toBe("s0");
  });

  it("changes nothing when no session closed", () => {
    const list = rememberClosed([], [session("a")], 1);
    expect(rememberClosed(list, [], 2)).toEqual(list);
  });
});

describe("withoutClosed", () => {
  it("drops the reopened site only", () => {
    const list = rememberClosed([], [session("a"), session("b")], 1);
    expect(withoutClosed(list, "a").map((tab) => tab.id)).toEqual(["b"]);
  });
});
