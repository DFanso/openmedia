import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetProfile, profileKey, rememberProfile, storedProfile } from "./profileStorage";

let items: Map<string, string>;

beforeEach(() => {
  items = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("per-profile storage", () => {
  it("hands what was saved before profiles to the first profile known, and no other", () => {
    items.set("om.keybindings", "old");
    expect(profileKey("om.keybindings")).toBe("om.keybindings");

    expect(rememberProfile("first", ["om.keybindings"])).toBe(true);
    expect(storedProfile()).toBe("first");
    expect(profileKey("om.keybindings")).toBe("om.keybindings:first");
    expect(items.get("om.keybindings:first")).toBe("old");
    expect(items.has("om.keybindings")).toBe(false);

    expect(rememberProfile("first", ["om.keybindings"])).toBe(false);
    expect(rememberProfile("second", ["om.keybindings"])).toBe(true);
    expect(items.has("om.keybindings:second")).toBe(false);
    expect(items.get("om.keybindings:first")).toBe("old");
  });

  it("forgets only the deleted profile's choices", () => {
    items.set("om.keybindings:a", "a");
    items.set("om.keybindings:b", "b");
    forgetProfile("a", ["om.keybindings"]);
    expect([...items.keys()]).toEqual(["om.keybindings:b"]);
  });
});
