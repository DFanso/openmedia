/** Ticks or unticks `id`. A tick past the limit changes nothing. */
export function toggleSelection(selected: readonly string[], id: string, limit: number): string[] {
  if (selected.includes(id)) return selected.filter((existing) => existing !== id);
  return selected.length < limit ? [...selected, id] : [...selected];
}
