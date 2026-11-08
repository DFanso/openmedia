import { describe, expect, it } from "vitest";
import { hostOf, registrableDomain, siteOf } from "./site";

describe("hostOf", () => {
  it("gives the host without its port", () => {
    expect(hostOf("https://m.youtube.com/watch?v=1")).toBe("m.youtube.com");
    expect(hostOf("http://localhost:3000")).toBe("localhost");
    expect(hostOf("https://example.com./")).toBe("example.com");
  });

  it("has no host for an address that is not one", () => {
    expect(hostOf("not a url")).toBeUndefined();
    expect(hostOf("about:blank")).toBeUndefined();
  });
});

describe("registrableDomain", () => {
  it("gives the part of the host the site owns", () => {
    expect(registrableDomain("m.youtube.com")).toBe("youtube.com");
    expect(registrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("example.com")).toBe("example.com");
    expect(registrableDomain("example.com.")).toBe("example.com");
    expect(registrableDomain("localhost")).toBe("localhost");
  });
});

describe("siteOf", () => {
  it("gives the part of the host the site owns", () => {
    expect(siteOf("https://m.youtube.com/watch?v=1")).toBe("youtube.com");
    expect(siteOf("https://www.instagram.com/")).toBe("instagram.com");
    expect(siteOf("https://old.reddit.com/r/rust")).toBe("reddit.com");
    expect(siteOf("https://news.bbc.co.uk/news")).toBe("bbc.co.uk");
    expect(siteOf("https://example.com")).toBe("example.com");
    expect(siteOf("http://localhost:3000")).toBe("localhost");
  });

  it("has no site for an address that is not one", () => {
    expect(siteOf("not a url")).toBeNull();
    expect(siteOf("about:blank")).toBeNull();
  });
});
