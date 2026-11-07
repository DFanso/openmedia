import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Site {
  id: string;
  url: string;
  title: string;
}

export interface Profile {
  id: string;
  name: string;
  sites: Site[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SiteViewState {
  url: string | null;
  title: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

async function command(name: string, args?: Record<string, unknown>): Promise<void> {
  await invoke(name, args);
}

export const library = {
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  createProfile: (name: string) => invoke<Profile>("create_profile", { name }),
  deleteProfile: (profileId: string) => command("delete_profile", { profileId }),
  addSite: (profileId: string, url: string) => invoke<Site>("add_site", { profileId, url }),
  removeSite: (profileId: string, siteId: string) => command("remove_site", { profileId, siteId }),
};

export const siteView = {
  open: (profile: string, url: string, rect: Rect) =>
    command("plugin:siteview|open", { request: { profile, url, rect } }),
  close: () => command("plugin:siteview|close"),
  setRect: (rect: Rect) => command("plugin:siteview|set_rect", { request: { rect } }),
  navigate: (url: string) => command("plugin:siteview|navigate", { request: { url } }),
  goBack: () => command("plugin:siteview|go_back"),
  goForward: () => command("plugin:siteview|go_forward"),
  reload: () => command("plugin:siteview|reload"),
  onState: (handler: (state: SiteViewState) => void): Promise<UnlistenFn> =>
    listen<SiteViewState>("siteview:state", (event) => handler(event.payload)),
  onError: (handler: (message: string) => void): Promise<UnlistenFn> =>
    listen<string>("siteview:error", (event) => handler(event.payload)),
};

export function errorMessage(error: unknown): string {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Unknown error";
}
