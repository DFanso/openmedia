import { afterEach, describe, expect, it } from "vitest";
import {
  isUsageBlocked,
  limitReached,
  policyForHost,
  policyForSection,
  useUsageControl,
} from "./policy";

const policies = {
  "example.com": { warnSeconds: 60, limitSeconds: 120 },
  "other.test": { warnSeconds: null, limitSeconds: 600 },
};
const target = (host: string, section = "/") => ({ host, section });

afterEach(() =>
  useUsageControl.setState({
    policies: {},
    sectionPolicies: {},
    seconds: {},
    sectionSeconds: {},
    ready: false,
  }),
);

describe("daily site limits", () => {
  it("blocks at the exact boundary, not the warning, and keeps unrelated sites open", () => {
    useUsageControl.setState({
      policies,
      seconds: { "example.com": 119, "other.test": 50 },
      ready: true,
    });
    expect(isUsageBlocked(target("example.com"))).toBe(false);
    useUsageControl.setState({ seconds: { "example.com": 120, "other.test": 50 } });
    expect(isUsageBlocked(target("example.com"))).toBe(true);
    expect(isUsageBlocked(target("other.test"))).toBe(false);
    expect(isUsageBlocked(target("unknown.test"))).toBe(false);
  });

  it("applies parent site limits to mobile subdomains without matching lookalike domains", () => {
    expect(limitReached(policyForHost(policies, "m.example.com"), 120)).toBe(true);
    expect(policyForHost(policies, "notexample.com")).toBeUndefined();
  });

  it("matches a configured www host to the native registrable-domain scope", () => {
    expect(policyForHost({ "www.example.com": policies["example.com"] }, "example.com")).toEqual(
      policies["example.com"],
    );
  });

  it("blocks only the configured section while allowing other sections of that site", () => {
    useUsageControl.setState({
      sectionPolicies: {
        "example.com": { "/reels": { warnSeconds: 3600, limitSeconds: 7200 } },
      },
      sectionSeconds: { "example.com": { "/reels": 3600, "/messages": 9000 } },
      ready: true,
    });
    expect(isUsageBlocked(target("example.com", "/reels"))).toBe(false);
    useUsageControl.setState({
      sectionSeconds: { "example.com": { "/reels": 7200, "/messages": 9000 } },
    });
    expect(isUsageBlocked(target("example.com", "/reels"))).toBe(true);
    expect(isUsageBlocked(target("example.com", "/messages"))).toBe(false);
    expect(isUsageBlocked(target("other.test", "/reels"))).toBe(false);
  });

  it("applies parent section policies to subdomains, but not lookalike domains", () => {
    const sectionPolicies = {
      "example.com": { "/reels": { warnSeconds: null, limitSeconds: 120 } },
    };
    expect(policyForSection(sectionPolicies, "m.example.com", "/reels")).toEqual(
      sectionPolicies["example.com"]["/reels"],
    );
    expect(policyForSection(sectionPolicies, "notexample.com", "/reels")).toBeUndefined();
  });

  it("keeps warning-only policies unblocked and lifts site limits when today's totals reset", () => {
    expect(limitReached({ warnSeconds: 60, limitSeconds: null }, 90_000)).toBe(false);
    useUsageControl.setState({ policies, seconds: { "example.com": 120 }, ready: true });
    expect(isUsageBlocked(target("example.com"))).toBe(true);
    useUsageControl.setState({
      day: "2026-11-09",
      seconds: {},
      sectionSeconds: {},
    });
    expect(isUsageBlocked(target("example.com"))).toBe(false);
  });
});
