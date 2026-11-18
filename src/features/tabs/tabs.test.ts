import { describe, expect, it } from "vitest";
import type { UsageReport } from "../../shared/ipc";
import { newSession, type Session } from "../web/sessions";
import {
  formatMs,
  hiddenTabIds,
  moveTab,
  orderedTabs,
  secondsTodayFor,
  tabAfterClose,
  tabNumber,
} from "./tabs";

const session = (id: string, lastUsed: number): Session => ({
  ...newSession(id, "typed", `https://${id}.example/`, lastUsed),
  lastUsed,
});

describe("orderedTabs", () => {
  it("lists the visible site first, then the most recently used", () => {
    const list = [session("a", 10), session("b", 30), session("c", 20)];
    expect(orderedTabs(list, "a").map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(orderedTabs(list, null).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("tab numbers", () => {
  it("numbers the first eight tabs as the shortcuts do and no others", () => {
    expect([0, 1, 7].map(tabNumber)).toEqual([1, 2, 8]);
    expect(tabNumber(8)).toBeNull();
    expect(tabNumber(-1)).toBeNull();
  });
});

describe("moveTab", () => {
  const list = [session("a", 1), session("b", 2), session("c", 3)];
  const ids = (sessions: Session[]) => sessions.map((s) => s.id);

  it("moves a tab down and up", () => {
    expect(ids(moveTab(list, "a", 2))).toEqual(["b", "c", "a"]);
    expect(ids(moveTab(list, "c", 0))).toEqual(["c", "a", "b"]);
  });

  it("clamps the position and leaves the input alone", () => {
    expect(ids(moveTab(list, "a", 99))).toEqual(["b", "c", "a"]);
    expect(ids(moveTab(list, "c", -5))).toEqual(["c", "a", "b"]);
    expect(ids(list)).toEqual(["a", "b", "c"]);
  });

  it("changes nothing for the same position or an unknown tab", () => {
    expect(ids(moveTab(list, "b", 1))).toEqual(["a", "b", "c"]);
    expect(ids(moveTab(list, "zzz", 0))).toEqual(["a", "b", "c"]);
  });
});

describe("closing", () => {
  const list = [session("a", 10), session("b", 30), session("c", 20)];

  it("closes every hidden site and keeps the visible one", () => {
    expect(hiddenTabIds(list, "b")).toEqual(["a", "c"]);
  });

  it("shows the most recently used of the rest after the visible one closes", () => {
    expect(tabAfterClose(list, "b")).toBe("c");
    expect(tabAfterClose([session("a", 1)], "a")).toBeNull();
  });
});

describe("secondsTodayFor", () => {
  const report: UsageReport = {
    totalSeconds: 100,
    sites: [
      { host: "youtube.com", name: null, seconds: 60, sections: [] },
      { host: "m.youtube.com", name: null, seconds: 15, sections: [] },
      { host: "other.test", name: null, seconds: 25, sections: [] },
    ],
  };

  it("adds the entries on the session's domain and nothing from lookalikes", () => {
    expect(secondsTodayFor(report, "youtube.com")).toBe(75);
    expect(secondsTodayFor(report, "tube.com")).toBeNull();
  });

  it("has no figure without a report or a known domain", () => {
    expect(secondsTodayFor(null, "youtube.com")).toBeNull();
    expect(secondsTodayFor(report, null)).toBeNull();
  });
});

describe("formatMs", () => {
  it("reads milliseconds under a second and seconds above", () => {
    expect(formatMs(340)).toBe("340 ms");
    expect(formatMs(1234)).toBe("1.2 s");
    expect(formatMs(12_400)).toBe("12 s");
  });
});
