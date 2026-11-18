import { invoke } from "@tauri-apps/api/core";
import type { AppStore } from "../../app/store";
import type { Translate } from "../../i18n/translate";
import type { Profile, ProfileInput, ProfileList } from "../../shared/ipc";

/** The most profiles there can be; Rust enforces it (`profiles::MAX_PROFILES`). */
export const MAX_PROFILES = 10;
export const MAX_PROFILE_NAME = 20;

/** Profiles' own commands; see `profiles.rs`. */
export const profilesIpc = {
  list: () => invoke<ProfileList>("profiles_list"),
  create: (input: ProfileInput) => invoke<ProfileList>("profile_create", { input }),
  update: (id: string, input: ProfileInput) => invoke<ProfileList>("profile_update", { id, input }),
  remove: (id: string) => invoke<ProfileList>("profile_delete", { id }),
  /** Makes `id` the profile in use; the shell must have closed its pages and reloads after. */
  switchTo: async (id: string): Promise<void> => {
    await invoke("profile_switch", { id });
  },
};

/** A profile as the shell shows it: always with a name. */
export interface ShownProfile {
  id: string;
  name: string;
  icon?: string;
}

export function shownProfile(profile: Profile, t: Translate): ShownProfile {
  return { ...profile, name: profile.name?.trim() || t("profiles.defaultName") };
}

/** The profile in use, unnamed or not; null before the startup state arrives. */
export const selectActiveProfile = (store: Pick<AppStore, "profiles">): Profile | null =>
  store.profiles?.profiles.find((profile) => profile.id === store.profiles?.active) ?? null;
