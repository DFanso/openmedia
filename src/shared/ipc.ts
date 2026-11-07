import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Favorite {
  id: string;
  name: string;
  url: string;
}

export interface FavoriteInput {
  name: string;
  url: string;
}

export interface AppState {
  profileId: string;
  favorites: Favorite[];
  lastUrl: string | null;
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
  getState: () => invoke<AppState>("get_state"),
  setFavorites: (favorites: FavoriteInput[]) => invoke<Favorite[]>("set_favorites", { favorites }),
  setLastUrl: (url: string) => command("set_last_url", { url }),
};

export const siteView = {
  open: (profile: string, url: string, rect: Rect) =>
    command("plugin:siteview|open", { request: { profile, url, rect } }),
  close: () => command("plugin:siteview|close"),
  setRect: (rect: Rect) => command("plugin:siteview|set_rect", { request: { rect } }),
  setInteractiveRegions: (regions: Rect[]) =>
    command("plugin:siteview|set_interactive_regions", { request: { regions } }),
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
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : "Unknown error";
}
