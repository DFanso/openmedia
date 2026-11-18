import { useMemo } from "react";
import { selectQuickFavorites, selectQuickFolders, useApp } from "../../app/store";
import { isMac } from "../../shared/platform";
import { ACTIONS, libraryActions, type ActionInfo } from "./actionList";
import { effectiveBindings } from "./keymap";
import { useKeybindings } from "./store";

/** Every action now, fixed and per favorite and folder, with the keys in force for each. */
export function useBindings(): {
  actions: readonly ActionInfo[];
  byId: ReadonlyMap<string, ActionInfo>;
  bindings: Map<string, string[]>;
} {
  const profile = useKeybindings((s) => s.profile);
  const overrides = useKeybindings((s) => s.overrides);
  const favorites = useApp(selectQuickFavorites);
  const folders = useApp(selectQuickFolders);
  const mac = isMac();
  return useMemo(() => {
    const library = libraryActions(favorites, folders);
    const actions = [...ACTIONS, ...library];
    return {
      actions,
      byId: new Map(actions.map((info) => [info.id, info])),
      bindings: effectiveBindings(profile, overrides, mac, new Set(library.map((i) => i.id))),
    };
  }, [profile, overrides, mac, favorites, folders]);
}
