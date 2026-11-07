import { create } from "zustand";
import {
  errorMessage,
  library,
  type AppState,
  type FavoriteInput,
  type SiteViewState,
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
  request: NavigationRequest | null;
  page: SiteViewState | null;
  load: () => Promise<void>;
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  goTo: (url: string) => void;
  setPage: (page: SiteViewState) => void;
  reportError: (message: string | null) => void;
  saveFavorites: (favorites: FavoriteInput[]) => Promise<boolean>;
}

let nonce = 0;
const nextRequest = (url: string): NavigationRequest => ({ url, nonce: ++nonce });

export const useApp = create<AppStore>((set) => ({
  state: null,
  error: null,
  sheet: "none",
  request: null,
  page: null,

  load: async () => {
    try {
      const state = await library.getState();
      const start = state.lastUrl ?? state.favorites[0]?.url;
      set({ state, request: start ? nextRequest(start) : null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: "none" }),
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
      return true;
    } catch (error) {
      set({ error: errorMessage(error) });
      return false;
    }
  },
}));
