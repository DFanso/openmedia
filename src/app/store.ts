import { create } from "zustand";
import {
  errorMessage,
  library,
  siteView,
  type AppState,
  type FavoriteInput,
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
  };
});
