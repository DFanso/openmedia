import { describe, expect, it } from "vitest";
import { QUICK_ACCESS_LIMIT, iconsByHost, quickAccess } from "./favorites";

describe("quickAccess", () => {
  it("keeps the first favorites in order and leaves the rest out", () => {
    const favorites = Array.from({ length: QUICK_ACCESS_LIMIT + 4 }, (_, index) => index);
    expect(quickAccess(favorites)).toEqual(favorites.slice(0, QUICK_ACCESS_LIMIT));
  });

  it("shows everything when there are few favorites", () => {
    expect(quickAccess(["a", "b"])).toEqual(["a", "b"]);
    expect(quickAccess([])).toEqual([]);
  });
});

describe("iconsByHost", () => {
  it("maps hosts to icons and skips favorites with no icon or a broken address", () => {
    const icons = iconsByHost([
      { url: "https://m.youtube.com/", icon: "data:image/png;base64,AA" },
      { url: "https://example.com/" },
      { url: "not a url", icon: "data:image/png;base64,BB" },
    ]);
    expect([...icons]).toEqual([["m.youtube.com", "data:image/png;base64,AA"]]);
  });
});
