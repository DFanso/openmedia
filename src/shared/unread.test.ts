import { describe, expect, it } from "vitest";
import { MAX_UNREAD, unreadCount } from "./unread";

describe("unreadCount", () => {
  it("reads the count sites put first in the title", () => {
    expect(unreadCount("(3) Messenger")).toBe(3);
    expect(unreadCount("  [12] Inbox")).toBe(12);
    expect(unreadCount("(9+) Home / X")).toBe(9);
    expect(unreadCount("(1) • Instagram")).toBe(1);
  });

  it("ignores numbers that are not a leading count", () => {
    expect(unreadCount(null)).toBe(0);
    expect(unreadCount("")).toBe(0);
    expect(unreadCount("Messenger (3)")).toBe(0);
    expect(unreadCount("3 new messages")).toBe(0);
    expect(unreadCount("(three) Messenger")).toBe(0);
    expect(unreadCount("(0) Messenger")).toBe(0);
  });

  it("caps what a page can claim", () => {
    expect(unreadCount("(99999) Messenger")).toBe(0);
    expect(unreadCount("(5000) Messenger")).toBe(MAX_UNREAD);
  });
});
