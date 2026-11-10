import { describe, expect, it } from "vitest";
import { earlierOf, newSession, resolveFocus, savedFor, withTurn } from "./chat";
import type { ChatSession, ChatTurn } from "./ipc";
import { proposal } from "./fixtures";

const turn = (id: string, request: string, status: "proposed" | "accepted"): ChatTurn => ({
  id,
  request,
  at: 1,
  provider: "Claude",
  steps: [],
  outcome:
    status === "accepted" ? { status: "accepted", proposal } : { status: "proposed", proposal },
});

const session = (id: string, domain: string, updatedAt: number): ChatSession => ({
  ...newSession(id, domain, updatedAt),
  updatedAt,
  turns: [turn(`${id}-1`, "hide the promo", "accepted")],
});

describe("chat", () => {
  it("names the chat after its first request and keeps the recipe of the proposal", () => {
    const chat = withTurn(
      newSession("c1", "example.org", 0),
      turn("t1", "hide the promo", "proposed"),
      10,
    );
    expect(chat.title).toBe("hide the promo");
    expect(chat.recipeId).toBe("youtube");
    expect(chat.recipeName).toBe("YouTube");
    expect(chat.updatedAt).toBe(10);
  });

  it("replaces the turn of the same id instead of adding another", () => {
    const chat = withTurn(
      newSession("c1", "example.org", 0),
      turn("t1", "hide the promo", "proposed"),
      10,
    );
    const accepted = withTurn(chat, turn("t1", "hide the promo", "accepted"), 20);
    expect(accepted.turns).toHaveLength(1);
    expect(accepted.turns[0].outcome.status).toBe("accepted");
    expect(accepted.turns[0].at).toBe(1);
  });

  it("keeps the oldest turns when a chat grows past the cap", () => {
    let chat = newSession("c1", "example.org", 0);
    for (let n = 0; n < 45; n += 1) {
      chat = withTurn(chat, turn(`t${n}`, `request ${n}`, "accepted"), n);
    }
    expect(chat.turns).toHaveLength(40);
    expect(chat.turns[0].request).toBe("request 5");
    expect(chat.title).toBe("request 0");
  });

  it("lists the chats of a site, the most recently used first", () => {
    const chats = [
      session("a", "example.org", 1),
      session("b", "other.net", 2),
      session("c", "example.org", 3),
    ];
    expect(savedFor(chats, "example.org").map((chat) => chat.id)).toEqual(["c", "a"]);
    expect(savedFor(chats, "nothing.net")).toEqual([]);
  });

  it("continues the chat of the site on screen, or a blank one the user asked for", () => {
    const chats = [session("a", "example.org", 1), session("b", "other.net", 2)];
    expect(resolveFocus(chats, "example.org", { activeId: null, blankDomain: null }).activeId).toBe(
      "a",
    );
    expect(resolveFocus(chats, "example.org", { activeId: "a", blankDomain: null }).activeId).toBe(
      "a",
    );
    expect(
      resolveFocus(chats, "example.org", { activeId: null, blankDomain: "example.org" }),
    ).toEqual({ activeId: null, blankDomain: "example.org" });
    expect(resolveFocus(chats, "other.net", { activeId: "a", blankDomain: null }).activeId).toBe(
      "b",
    );
    expect(
      resolveFocus(chats, "unknown.net", { activeId: null, blankDomain: null }).activeId,
    ).toBeNull();
  });

  it("tells the next prompt what happened in the earlier requests, but not the one being retried", () => {
    const chat = withTurn(
      newSession("c1", "example.org", 0),
      turn("t1", "hide the promo", "accepted"),
      10,
    );
    const withFailure: ChatTurn = {
      ...turn("t2", "hide the footer", "accepted"),
      outcome: { status: "failed", kind: "network", text: null },
    };
    const full = withTurn(chat, withFailure, 20);
    expect(earlierOf(full, "t2")).toEqual([{ request: "hide the promo", outcome: "applied" }]);
    expect(earlierOf(full, "t1")).toEqual([{ request: "hide the footer", outcome: "failed" }]);
    expect(earlierOf(undefined, "t1")).toEqual([]);
  });
});
