import { afterEach, describe, expect, it } from "vitest";
import { isUsageBlocked, limitReached, policyForHost, useUsageControl } from "./policy";

const policies = {
  "example.com": { warnSeconds: 60, limitSeconds: 120 },
  "other.test": { warnSeconds: null, limitSeconds: 600 },
};

afterEach(() => useUsageControl.setState({ policies: {}, seconds: {}, ready: false }));

describe("daily site limits", () => {
  it("blocks at the exact boundary, not the warning, and keeps unrelated sites open", () => {
    useUsageControl.setState({
      policies,
      seconds: { "example.com": 119, "other.test": 50 },
      ready: true,
    });
    expect(isUsageBlocked("example.com")).toBe(false);
    useUsageControl.setState({ seconds: { "example.com": 120, "other.test": 50 } });
    expect(isUsageBlocked("example.com")).toBe(true);
    expect(isUsageBlocked("other.test")).toBe(false);
    expect(isUsageBlocked("unknown.test")).toBe(false);
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

  it("keeps warning-only policies unblocked and lifts limits when today's totals reset", () => {
    expect(limitReached({ warnSeconds: 60, limitSeconds: null }, 90_000)).toBe(false);
    useUsageControl.setState({ policies, seconds: { "example.com": 120 }, ready: true });
    expect(isUsageBlocked("example.com")).toBe(true);
    useUsageControl.setState({ day: "2026-11-09", seconds: {} });
    expect(isUsageBlocked("example.com")).toBe(false);
  });
});
