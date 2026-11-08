import { describe, expect, it } from "vitest";
import { pageShowing } from "./splash";

describe("pageShowing", () => {
  it("lets the splash go when there is no page to wait for", () => {
    expect(pageShowing(null)).toBe(true);
  });

  it("keeps the splash while a page is opening and has drawn nothing", () => {
    expect(pageShowing({ painted: false, loading: true, url: null })).toBe(false);
    expect(pageShowing({ painted: false, loading: true, url: "https://a.com/" })).toBe(false);
  });

  it("keeps the splash for the state the native side sends before the load starts", () => {
    expect(pageShowing({ painted: false, loading: false, url: null })).toBe(false);
  });

  it("lets the splash go once the page has painted, even while it is still loading", () => {
    expect(pageShowing({ painted: true, loading: true, url: "https://a.com/" })).toBe(true);
  });

  it("lets the splash go when a load ended without a paint", () => {
    expect(pageShowing({ painted: false, loading: false, url: "https://a.com/" })).toBe(true);
  });
});
