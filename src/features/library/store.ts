import { create } from "zustand";
import { errorMessage, library, type Profile } from "../../shared/ipc";

interface LibraryState {
  profiles: Profile[];
  activeProfileId: string | null;
  error: string | null;
  load: () => Promise<void>;
  selectProfile: (id: string) => void;
  createProfile: (name: string) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  addSite: (url: string) => Promise<void>;
  removeSite: (siteId: string) => Promise<void>;
}

export const useLibrary = create<LibraryState>((set, get) => {
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      set({ error: null });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  };

  const reload = async () => {
    const profiles = await library.listProfiles();
    const active = get().activeProfileId;
    set({
      profiles,
      activeProfileId: profiles.some((p) => p.id === active) ? active : (profiles[0]?.id ?? null),
    });
  };

  const requireActive = () => {
    const id = get().activeProfileId;
    if (!id) throw new Error("No profile selected");
    return id;
  };

  return {
    profiles: [],
    activeProfileId: null,
    error: null,
    load: () => run(reload),
    selectProfile: (id) => set({ activeProfileId: id }),
    createProfile: (name) =>
      run(async () => {
        const profile = await library.createProfile(name);
        await reload();
        set({ activeProfileId: profile.id });
      }),
    deleteProfile: (id) =>
      run(async () => {
        await library.deleteProfile(id);
        await reload();
      }),
    addSite: (url) =>
      run(async () => {
        await library.addSite(requireActive(), url);
        await reload();
      }),
    removeSite: (siteId) =>
      run(async () => {
        await library.removeSite(requireActive(), siteId);
        await reload();
      }),
  };
});
