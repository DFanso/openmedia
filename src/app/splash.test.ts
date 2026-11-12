import { describe, expect, it } from "vitest";
import { pageShowing, splashDone, type StartupProgress } from "./splash";

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

const waiting: StartupProgress = {
  shellReady: true,
  page: { painted: false, loading: true, url: "https://a.com/" },
  failed: false,
};

describe("splashDone", () => {
  it("keeps the splash up while the web view is still booting", () => {
    expect(splashDone({ ...waiting, shellReady: false })).toBe(false);
  });

  it("keeps the splash up while the first site has drawn nothing", () => {
    expect(splashDone(waiting)).toBe(false);
  });

  it("keeps the splash up while the first site is loaded but has not painted", () => {
    expect(
      splashDone({ ...waiting, page: { painted: false, loading: false, url: "https://a.com/" } }),
    ).toBe(false);
  });

  it("lifts the splash once the first site has painted", () => {
    expect(
      splashDone({ ...waiting, page: { painted: true, loading: true, url: "https://a.com/" } }),
    ).toBe(true);
  });

  it("lifts the splash when the app opened no site at all", () => {
    expect(splashDone({ ...waiting, page: null })).toBe(true);
  });

  it("lifts the splash when the start page could not be opened", () => {
    expect(splashDone({ ...waiting, failed: true })).toBe(true);
  });
});
