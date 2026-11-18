import type { FanTarget, Point } from "./geometry";

export const DRAG_SLOP = 8;
export const HOLD_MS = 380;
/** How long a press on a draggable site button is held before it lifts and can be dragged out. */
export const CARRY_HOLD_MS = 350;

/** A site button's hold: building up, or armed so that moving it outward starts a drag. */
export type CarryHold = "idle" | "charging" | "armed";

/**
 * Where a press on a draggable button stands. `heldMs` is how long the press has lasted, or null
 * when nothing is pressed; `strayed` is true once the pointer moved past the slop before the hold
 * finished, which ends it for good: such a press turns the dial or slides, it never lifts.
 */
export function carryHold(heldMs: number | null, strayed: boolean): CarryHold {
  if (heldMs === null || strayed) return "idle";
  return heldMs >= CARRY_HOLD_MS ? "armed" : "charging";
}

/** Whether a pointer `moved` pixels from where it went down has left the press behind. */
export const strayedFromPress = (moved: number): boolean => moved > DRAG_SLOP;

export type GestureState =
  | { phase: "idle" }
  | { phase: "pressing"; start: Point }
  | { phase: "dragging"; position: Point }
  | { phase: "fan"; hover: FanTarget | null };

export type GestureEvent =
  | { type: "down"; point: Point }
  | { type: "move"; point: Point; hit: FanTarget | null }
  | { type: "up"; point: Point; hit: FanTarget | null }
  | { type: "holdElapsed" }
  | { type: "dismiss" };

export type GestureEffect =
  | { type: "tap" }
  | { type: "snap"; drop: Point }
  | { type: "openFan" }
  | { type: "closeFan" }
  | { type: "select"; target: FanTarget };

export interface GestureStep {
  state: GestureState;
  effects: GestureEffect[];
}

const idle: GestureState = { phase: "idle" };

/**
 * One finger on the floating button: a tap opens the assistant, a drag moves the button, and a
 * hold opens the fan. In the fan, sliding onto an item and lifting selects it; lifting anywhere
 * else leaves the fan open for a tap.
 */
export function reduceGesture(state: GestureState, event: GestureEvent): GestureStep {
  const stay = { state, effects: [] };

  switch (state.phase) {
    case "idle":
      return event.type === "down"
        ? { state: { phase: "pressing", start: event.point }, effects: [] }
        : stay;

    case "pressing":
      if (event.type === "holdElapsed") {
        return { state: { phase: "fan", hover: null }, effects: [{ type: "openFan" }] };
      }
      if (event.type === "move") {
        const moved = Math.hypot(event.point.x - state.start.x, event.point.y - state.start.y);
        return moved > DRAG_SLOP
          ? { state: { phase: "dragging", position: event.point }, effects: [] }
          : stay;
      }
      if (event.type === "up") return { state: idle, effects: [{ type: "tap" }] };
      return event.type === "dismiss" ? { state: idle, effects: [] } : stay;

    case "dragging":
      if (event.type === "move") {
        return { state: { phase: "dragging", position: event.point }, effects: [] };
      }
      if (event.type === "up") {
        return { state: idle, effects: [{ type: "snap", drop: event.point }] };
      }
      return event.type === "dismiss" ? { state: idle, effects: [] } : stay;

    case "fan":
      if (event.type === "move") return { state: { phase: "fan", hover: event.hit }, effects: [] };
      if (event.type === "up") {
        return event.hit
          ? { state: idle, effects: [{ type: "select", target: event.hit }, { type: "closeFan" }] }
          : { state: { phase: "fan", hover: null }, effects: [] };
      }
      return event.type === "dismiss" ? { state: idle, effects: [{ type: "closeFan" }] } : stay;
  }
}
