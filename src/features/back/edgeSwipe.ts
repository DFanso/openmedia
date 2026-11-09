export type Side = "left" | "right";

export interface TouchPoint {
  x: number;
  y: number;
}

/** A swipe that begins this close to the screen edge counts as the back gesture. */
export const EDGE_ZONE = 24;
/** How far inward the finger must travel. */
export const SWIPE_DISTANCE = 72;
/** The travel must be this much more sideways than vertical, so a scroll is not taken for it. */
const HORIZONTAL_BIAS = 1.5;

/** The edge a back swipe starts from: where reading starts, so the right edge in right-to-left. */
export const backSide = (dir: string): Side => (dir === "rtl" ? "right" : "left");

export function startsAtEdge(x: number, width: number, side: Side): boolean {
  return side === "left" ? x <= EDGE_ZONE : x >= width - EDGE_ZONE;
}

export function swipedBack(start: TouchPoint, now: TouchPoint, side: Side): boolean {
  const inward = side === "left" ? now.x - start.x : start.x - now.x;
  const sideways = Math.abs(now.y - start.y);
  return inward >= SWIPE_DISTANCE && inward >= sideways * HORIZONTAL_BIAS;
}
