import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type Theme = "system" | "light" | "dark";

export interface Favorite {
  id: string;
  name: string;
  url: string;
  /** A small PNG data URL fetched from the site itself, when known. */
  icon?: string;
}

export interface FavoriteInput {
  name: string;
  url: string;
}

export interface AppState {
  profileId: string;
  favorites: Favorite[];
  lastUrl: string | null;
  onboarded: boolean;
  theme: Theme;
  adBlock: boolean;
  backButton: boolean;
}

export type ProviderKind = "anthropic" | "openAiCompatible";

/** A provider as the shell sees it. There is no key field: keys never come back from Rust. */
export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string | null;
  hasKey: boolean;
}

export interface ProviderInput {
  id?: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model?: string | null;
}

export interface AiState {
  providers: Provider[];
  activeId: string | null;
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
  refreshIcons: () => invoke<Favorite[]>("refresh_icons"),
  setLastUrl: (url: string) => command("set_last_url", { url }),
  completeOnboarding: () => command("complete_onboarding"),
  resetOnboarding: () => command("reset_onboarding"),
  setTheme: (theme: Theme) => command("set_theme", { theme }),
  /** Persists the choice and reloads the open page under it; see `set_ad_block` in Rust. */
  setAdBlock: (enabled: boolean) => command("set_ad_block", { enabled }),
  setBackButton: (enabled: boolean) => command("set_back_button", { enabled }),
  /** Opens the page natively with the recipe script attached; see `open_site` in Rust. */
  openSite: (url: string, rect: Rect) => command("open_site", { url, rect }),
};

export const ai = {
  state: () => invoke<AiState>("ai_state"),
  saveProvider: (provider: ProviderInput) => invoke<Provider>("ai_save_provider", { provider }),
  deleteProvider: (id: string) => command("ai_delete_provider", { id }),
  /** The only place a key leaves the shell: straight to Rust and the Keychain, once. */
  setKey: (id: string, key: string) => command("ai_set_key", { id, key }),
  removeKey: (id: string) => command("ai_remove_key", { id }),
  setActive: (id: string | null) => command("ai_set_active", { id }),
  /** Asks the provider for its models; proves the key works. */
  test: (id: string) => invoke<string[]>("ai_test", { id }),
};

export const siteView = {
  close: () => command("plugin:siteview|close"),
  setRect: (rect: Rect) => command("plugin:siteview|set_rect", { request: { rect } }),
  setInteractiveRegions: (regions: Rect[]) =>
    command("plugin:siteview|set_interactive_regions", { request: { regions } }),
  setColorScheme: (scheme: Theme) =>
    command("plugin:siteview|set_color_scheme", { request: { scheme } }),
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
