import { create } from "zustand";
import {
  applyState,
  findFavoriteSession,
  findTypedSession,
  newSession,
  startSource,
  sessionsToClose,
  type Pressure,
  type Session,
  type SessionSource,
} from "../features/web/sessions";
import {
  errorMessage,
  library,
  siteView,
  type AppState,
  type Favorite,
  type FavoriteInput,
  type SiteSettings,
  type SiteViewState,
  type Theme,
} from "../shared/ipc";
import type { Edge } from "../features/fab/geometry";
import { loadPosition } from "../features/fab/position";

export type Sheet = "none" | "assistant" | "history" | "settings";

/** What the web layer must do natively next; `nonce` makes a repeat of the same action distinct. */
export type SessionAction = { nonce: number } & (
  | { type: "open"; id: string; url: string; previousId: string | null }
  | { type: "activate"; id: string }
);

interface AppStore {
  state: AppState | null;
  error: string | null;
  sheet: Sheet;
  onboardingOpen: boolean;
  sessions: Session[];
  activeId: string | null;
  action: SessionAction | null;
  /** Edge the floating button rests on; the back button takes the other one. */
  fabEdge: Edge;
  sites: SiteSettings[];
  load: () => Promise<void>;
  openSheet: (sheet: Sheet) => void;
  closeSheet: () => void;
  /** Marks the guide unseen again and shows it now. */
  resetGuide: () => Promise<void>;
  finishGuide: () => Promise<void>;
  /** An address the user typed: always a new session, and remembered in history. */
  openAddress: (url: string) => void;
  /** A favorite: switches to its live session if there is one, otherwise opens a new one. */
  openFavorite: (url: string) => void;
  /** A history entry: switches to the live session typed with it, otherwise opens a new one. */
  openHistory: (url: string) => void;
  setSessionState: (state: SiteViewState) => void;
  /** A native `open` failed: forget the session and go back to the one that was showing. */
  sessionOpenFailed: (id: string) => void;
  /** The native side already closed these; forget them. */
  forgetSessions: (ids: string[]) => void;
  /** Closes old, surplus or (under memory pressure) all hidden sessions. */
  trimSessions: (pressure: Pressure) => void;
  reportError: (message: string | null) => void;
  saveFavorites: (favorites: FavoriteInput[]) => Promise<boolean>;
  /** Adds a pre-made recipe's site to the favorites, or removes every favorite that opens it. */
  setSiteFavorite: (recipeId: string, favorite: boolean) => Promise<void>;
  clearHistory: () => Promise<void>;
  setTheme: (theme: Theme) => Promise<void>;
  setAdBlock: (enabled: boolean) => Promise<void>;
  loadSites: () => Promise<void>;
  setSiteOption: (recipeId: string, optionId: string, enabled: boolean) => Promise<void>;
  setBottomMargin: (pixels: number) => Promise<void>;
  /** `null` returns the site to the shared margin. */
  setSiteBottomMargin: (recipeId: string, pixels: number | null) => Promise<void>;
  setBackButton: (enabled: boolean) => Promise<void>;
  setFabEdge: (edge: Edge) => void;
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

/** The page the user is looking at. */
export const selectPage = (store: AppStore): Session | null =>
  store.sessions.find((session) => session.id === store.activeId) ?? null;

let nonce = 0;

export const useApp = create<AppStore>((set, get) => {
  const fetchIcons = async () => {
    try {
      const favorites = await library.refreshIcons();
      set((current) => ({ state: current.state && { ...current.state, favorites } }));
    } catch {
      // icons are decoration; the monogram stays
    }
  };

  /** Takes the saved favorites, fetches missing icons, and refreshes which sites are favorited. */
  const adoptFavorites = (favorites: Favorite[]) => {
    set((current) => ({
      state: current.state && { ...current.state, favorites },
      error: null,
    }));
    void fetchIcons();
    void get().loadSites();
  };

  const markUsed = (sessions: Session[], id: string | null, now: number) =>
    sessions.map((session) => (session.id === id ? { ...session, lastUsed: now } : session));

  const startSession = (url: string, source: SessionSource) => {
    const now = Date.now();
    const id = crypto.randomUUID();
    const previousId = get().activeId;
    set((current) => ({
      sessions: [...markUsed(current.sessions, previousId, now), newSession(id, source, url, now)],
      activeId: id,
      sheet: "none",
      action: { nonce: ++nonce, type: "open", id, url, previousId },
    }));
    get().trimSessions("routine");
  };

  const switchTo = (id: string) => {
    const now = Date.now();
    const previousId = get().activeId;
    set((current) => ({
      sessions: markUsed(markUsed(current.sessions, previousId, now), id, now),
      activeId: id,
      sheet: "none",
      action: { nonce: ++nonce, type: "activate", id },
    }));
    get().trimSessions("routine");
  };

  return {
    state: null,
    error: null,
    sheet: "none",
    onboardingOpen: false,
    sessions: [],
    activeId: null,
    action: null,
    fabEdge: loadPosition().edge,
    sites: [],

    load: async () => {
      try {
        const state = await library.getState();
        const start = state.lastUrl ?? state.favorites[0]?.url;
        void siteView.setColorScheme(state.theme).catch(() => {});
        set({ state, onboardingOpen: !state.onboarded });
        if (start) startSession(start, startSource(state.favorites, start));
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

    openAddress: (url) => {
      startSession(url, "typed");
      void library
        .addHistory(url)
        .then((history) =>
          set((current) => ({ state: current.state && { ...current.state, history } })),
        )
        .catch((error: unknown) => set({ error: errorMessage(error) }));
    },

    openFavorite: (url) => {
      const live = findFavoriteSession(get().sessions, url);
      if (live) switchTo(live.id);
      else startSession(url, "favorite");
    },

    openHistory: (url) => {
      const live = findTypedSession(get().sessions, url);
      if (live) switchTo(live.id);
      else get().openAddress(url);
    },

    setSessionState: (page) =>
      set((current) => ({
        sessions: current.sessions.map((session) =>
          session.id === page.session ? applyState(session, page) : session,
        ),
      })),

    sessionOpenFailed: (id) =>
      set((current) => {
        const action = current.action;
        const previousId = action?.type === "open" && action.id === id ? action.previousId : null;
        const sessions = current.sessions.filter((session) => session.id !== id);
        return {
          sessions,
          activeId:
            current.activeId === id
              ? sessions.some((session) => session.id === previousId)
                ? previousId
                : (sessions[0]?.id ?? null)
              : current.activeId,
        };
      }),

    forgetSessions: (ids) =>
      set((current) => ({
        sessions: current.sessions.filter((session) => !ids.includes(session.id)),
        activeId: ids.includes(current.activeId ?? "") ? null : current.activeId,
      })),

    trimSessions: (pressure) => {
      const { sessions, activeId } = get();
      const doomed = sessionsToClose(sessions, activeId, Date.now(), pressure);
      if (doomed.length === 0) return;
      doomed.forEach((id) => void siteView.close(id).catch(() => {}));
      get().forgetSessions(doomed);
    },

    reportError: (error) => set({ error }),

    saveFavorites: async (favorites) => {
      try {
        adoptFavorites(await library.setFavorites(favorites));
        return true;
      } catch (error) {
        set({ error: errorMessage(error) });
        return false;
      }
    },

    setSiteFavorite: async (recipeId, favorite) => {
      const before = get().sites;
      set({ sites: updateSite(before, recipeId, (site) => ({ ...site, favorite })) });
      try {
        adoptFavorites(await library.setSiteFavorite(recipeId, favorite));
      } catch (error) {
        set({ sites: before, error: errorMessage(error) });
      }
    },

    clearHistory: async () => {
      try {
        await library.clearHistory();
        set((current) => ({
          state: current.state && { ...current.state, history: [], lastUrl: null },
        }));
      } catch (error) {
        set({ error: errorMessage(error) });
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

    setBackButton: async (enabled) => {
      const previous = get().state?.backButton;
      set((current) => ({ state: current.state && { ...current.state, backButton: enabled } }));
      try {
        await library.setBackButton(enabled);
      } catch (error) {
        set((current) => ({
          state:
            current.state && previous !== undefined
              ? { ...current.state, backButton: previous }
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
    setFabEdge: (fabEdge) => set({ fabEdge }),
  };
});
