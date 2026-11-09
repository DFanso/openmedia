import { describe, expect, it } from "vitest";
import { createMatcher } from "../../shared/public-suffix/match.mjs";
import rules from "../../shared/public-suffix/resources/public_suffix_rules.txt?raw";
import appVectors from "../../shared/public-suffix/app-vectors.json";
import officialVectors from "../../shared/public-suffix/vectors.json";
import { registrableDomain, siteOf } from "./site";

const registrable = createMatcher(rules);

describe("the Public Suffix List matcher", () => {
  it.each([
    ["the official vectors", officialVectors],
    ["the app vectors", appVectors],
  ])("passes %s", (_name, vectors) => {
    expect(vectors.length).toBeGreaterThan(0);
    for (const [host, expected] of vectors as [string, string | null][]) {
      expect(registrable(host), host).toBe(expected);
    }
  });
});

describe("sites on a shared public suffix", () => {
  it("keeps each user of a hosting suffix a site of their own", () => {
    expect(registrableDomain("alice.github.io")).not.toBe(registrableDomain("bob.github.io"));
    expect(siteOf("https://www.alice.github.io/page")).toBe("alice.github.io");
    expect(siteOf("https://foo.com.br/")).toBe("foo.com.br");
  });

  it("keeps a host without a registrable part whole", () => {
    expect(registrableDomain("github.io")).toBe("github.io");
    expect(registrableDomain("192.168.1.20")).toBe("192.168.1.20");
  });
});
