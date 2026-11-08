import { describe, expect, it } from "vitest";
import { providerReady, routeInput } from "./route";
import type { AiState } from "../../shared/ipc";

const provider = (hasKey: boolean) => ({
  id: "p",
  name: "P",
  kind: "anthropic" as const,
  baseUrl: "https://api.anthropic.com",
  model: null,
  hasKey,
});
const ready: AiState = { providers: [provider(true)], activeId: "p" };
const page = "https://www.youtube.com/watch?v=1";

describe("routeInput", () => {
  it("opens addresses even with no provider or page", () => {
    expect(routeInput("youtube.com", { ai: null, pageUrl: null })).toEqual({
      kind: "address",
      url: "https://youtube.com/",
    });
  });

  it("treats other text as a request", () => {
    expect(routeInput("  hide the suggested videos ", { ai: ready, pageUrl: page })).toEqual({
      kind: "request",
      request: "hide the suggested videos",
    });
  });

  it("is empty for blank text", () => {
    expect(routeInput("   ", { ai: ready, pageUrl: page })).toEqual({ kind: "empty" });
  });

  it("blocks requests without a ready provider", () => {
    const none: AiState = { providers: [provider(false)], activeId: "p" };
    for (const ai of [null, none, { providers: [provider(true)], activeId: null }]) {
      expect(routeInput("hide stories", { ai, pageUrl: page })).toEqual({
        kind: "blocked",
        reason: "noProvider",
      });
    }
    expect(providerReady(ready)).toBe(true);
  });

  it("blocks requests with no site page", () => {
    for (const pageUrl of [null, "about:blank"]) {
      expect(routeInput("hide stories", { ai: ready, pageUrl })).toEqual({
        kind: "blocked",
        reason: "noPage",
      });
    }
  });
});
