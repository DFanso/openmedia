import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { useApp } from "./store";

beforeEach(() => {
  invoke.mockReset();
  useApp.setState({ state: { backgroundMediaSites: ["music.example"] } as never, error: null });
});

describe("background media", () => {
  it("adds and removes a site, asking Rust to save each change", async () => {
    invoke.mockResolvedValue(undefined);
    await useApp.getState().setSiteBackgroundMedia("instagram.com", true);
    expect(useApp.getState().state?.backgroundMediaSites).toEqual([
      "music.example",
      "instagram.com",
    ]);
    expect(invoke).toHaveBeenCalledWith("set_site_background_media", {
      site: "instagram.com",
      enabled: true,
    });
    await useApp.getState().setSiteBackgroundMedia("music.example", false);
    expect(useApp.getState().state?.backgroundMediaSites).toEqual(["instagram.com"]);
  });

  it("puts the list back and reports when Rust refuses", async () => {
    invoke.mockRejectedValue("no such site to favorite");
    await useApp.getState().setSiteBackgroundMedia("instagram.com", true);
    expect(useApp.getState().state?.backgroundMediaSites).toEqual(["music.example"]);
    expect(useApp.getState().error).not.toBeNull();
  });
});
