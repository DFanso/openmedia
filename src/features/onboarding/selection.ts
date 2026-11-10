import { FREE_QUICK_ACCESS_LIMIT, QUICK_ACCESS_LIMIT } from "../../shared/favorites";

/** How many sites the guide may put in quick access: four, or six with Pro. */
export const quickAccessLimit = (pro: boolean): number =>
  pro ? QUICK_ACCESS_LIMIT : FREE_QUICK_ACCESS_LIMIT;

/** Ticks or unticks `id`. A tick past the limit changes nothing. */
export function toggleSelection(selected: readonly string[], id: string, limit: number): string[] {
  if (selected.includes(id)) return selected.filter((existing) => existing !== id);
  return selected.length < limit ? [...selected, id] : [...selected];
}
