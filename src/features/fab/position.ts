import type { Edge } from "./geometry";

const KEY = "om.fab";

export interface FabPosition {
  edge: Edge;
  /** Vertical centre as a fraction of the viewport height, so rotation keeps its place. */
  yRatio: number;
}

const fallback: FabPosition = { edge: "right", yRatio: 0.62 };

export function loadPosition(): FabPosition {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (value && typeof value === "object" && "edge" in value && "yRatio" in value) {
      const { edge, yRatio } = value;
      if ((edge === "left" || edge === "right") && typeof yRatio === "number") {
        return { edge, yRatio: Math.min(Math.max(yRatio, 0), 1) };
      }
    }
  } catch {
    // an unreadable preference falls back to the default position
  }
  return fallback;
}

export function savePosition(position: FabPosition) {
  localStorage.setItem(KEY, JSON.stringify(position));
}
