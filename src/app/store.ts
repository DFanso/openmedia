import { create } from "zustand";
import {
  errorMessage,
  library,
  siteView,
  type AppState,
  type FavoriteInput,
  type SiteSettings,
  type SiteViewState,
  type Theme,
} from "../shared/ipc";

export type Sheet = "none" | "assistant" | "settings";

export interface NavigationRequest {
  url: string;
  nonce: number;
}

interface AppStore {
  state: AppState | null;
  error: string | null;
  sheet: Sheet;
  onboardingOpen: boolean;
  request: NavigationRequest | null;
  page: SiteViewState | null;
  sites: SiteSettings[];
  load: () => Promise<void>;
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  /** Marks the guide unseen again and shows it now. */
  resetGuide: () => Promise<void>;
  finishGuide: () => Promise<void>;
  goTo: (url: string) => void;
  setPage: (page: SiteViewState) => void;
  reportError: (message: string | null) => void;
  saveFavorites: (favorites: FavoriteInput[]) => Promise<boolean>;
  setTheme: (theme: Theme) => Promise<void>;
  setAdBlock: (enabled: boolean) => Promise<void>;
  loadSites: () => Promise<void>;
  setSiteOption: (recipeId: string, optionId: string, enabled: boolean) => Promise<void>;
  setBottomMargin: (pixels: number) => Promise<void>;
  /** `null` returns the site to the shared margin. */
  setSiteBottomMargin: (recipeId: string, pixels: number | null) => Promise<void>;
}

function updateSite(
  sites: SiteSettings[],
  recipeId: string,
  change: (site: SiteSettings) => SiteSettings,
): SiteSettings[] {
  return sites.map((site) => (site.recipeId === recipeId ? change(site) : site));
}

function withOption(site: SiteSettings, optionId: string, enabled: boolean): SiteSettings {
  return {
    ...site,
    options: site.options.map((option) =>
      option.id === optionId ? { ...option, enabled } : option,
    ),
  };
}

let nonce = 0;
const nextRequest = (url: string): NavigationRequest => ({ url, nonce: ++nonce });

export const useApp = create<AppStore>((set, get) => {
  const fetchIcons = async () => {
    try {
      const favorites = await library.refreshIcons();
      set((current) => ({ state: current.state && { ...current.state, favorites } }));
    } catch {
      // icons are decoration; the monogram stays
    }
  };

  return {
    state: null,
    error: null,
    sheet: "none",
    onboardingOpen: false,
    request: null,
    page: null,
    sites: [],

    load: async () => {
      try {
        const state = await library.getState();
        const start = state.lastUrl ?? state.favorites[0]?.url;
        void siteView.setColorScheme(state.theme).catch(() => {});
        set({
          state,
          onboardingOpen: !state.onboarded,
          request: start ? nextRequest(start) : null,
        });
        void fetchIcons();
        void get().loadSites();
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    openSheet: (sheet) => set({ sheet }),
    closeSheet: () => set({ sheet: "none" }),

    resetGuide: async () => {
      try {
        await library.resetOnboarding();
        set((current) => ({
          onboardingOpen: true,
          state: current.state && { ...current.state, onboarded: false },
        }));
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    finishGuide: async () => {
      set({ onboardingOpen: false });
      try {
        await library.completeOnboarding();
        set((current) => ({ state: current.state && { ...current.state, onboarded: true } }));
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    goTo: (url) => set({ request: nextRequest(url), sheet: "none" }),
    setPage: (page) => set({ page }),
    reportError: (error) => set({ error }),

    saveFavorites: async (favorites) => {
      try {
        const saved = await library.setFavorites(favorites);
        set((current) => ({
          state: current.state && { ...current.state, favorites: saved },
          error: null,
        }));
        void fetchIcons();
        return true;
      } catch (error) {
        set({ error: errorMessage(error) });
        return false;
      }
    },

    setTheme: async (theme) => {
      const previous = get().state?.theme;
      set((current) => ({ state: current.state && { ...current.state, theme } }));
      try {
        await library.setTheme(theme);
        await siteView.setColorScheme(theme);
      } catch (error) {
        set((current) => ({
          state: current.state && previous ? { ...current.state, theme: previous } : current.state,
          error: errorMessage(error),
        }));
      }
    },

    setAdBlock: async (enabled) => {
      const previous = get().state?.adBlock;
      set((current) => ({ state: current.state && { ...current.state, adBlock: enabled } }));
      try {
        await library.setAdBlock(enabled);
      } catch (error) {
        set((current) => ({
          state:
            current.state && previous !== undefined
              ? { ...current.state, adBlock: previous }
              : current.state,
          error: errorMessage(error),
        }));
      }
    },

    loadSites: async () => {
      try {
        set({ sites: await library.getSites() });
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    setSiteOption: async (recipeId, optionId, enabled) => {
      const before = get().sites;
      set({ sites: updateSite(before, recipeId, (site) => withOption(site, optionId, enabled)) });
      try {
        await library.setSiteOption(recipeId, optionId, enabled);
      } catch (error) {
        set({ sites: before, error: errorMessage(error) });
      }
    },

    setBottomMargin: async (pixels) => {
      const previous = get().state?.bottomMargin;
      set((current) => ({
        state: current.state && { ...current.state, bottomMargin: pixels },
      }));
      try {
        await library.setBottomMargin(pixels);
      } catch (error) {
        set((current) => ({
          state:
            current.state && previous !== undefined
              ? { ...current.state, bottomMargin: previous }
              : current.state,
          error: errorMessage(error),
        }));
      }
    },

    setSiteBottomMargin: async (recipeId, pixels) => {
      const before = get().sites;
      set({ sites: updateSite(before, recipeId, (site) => ({ ...site, bottomMargin: pixels })) });
      try {
        await library.setSiteBottomMargin(recipeId, pixels);
      } catch (error) {
        set({ sites: before, error: errorMessage(error) });
      }
    },
  };
});
