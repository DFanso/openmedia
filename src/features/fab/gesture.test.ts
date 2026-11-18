import { describe, expect, it } from "vitest";
import {
  CARRY_HOLD_MS,
  DRAG_SLOP,
  carryHold,
  reduceGesture,
  strayedFromPress,
  type GestureEvent,
  type GestureState,
} from "./gesture";

const at = (x: number, y: number) => ({ x, y });

function run(events: GestureEvent[], from: GestureState = { phase: "idle" }) {
  let state = from;
  const effects = [];
  for (const event of events) {
    const step = reduceGesture(state, event);
    state = step.state;
    effects.push(...step.effects);
  }
  return { state, effects };
}

describe("floating button gesture", () => {
  it("a press and release is a tap", () => {
    const { state, effects } = run([
      { type: "down", point: at(10, 10) },
      { type: "move", point: at(12, 11), hit: null },
      { type: "up", point: at(12, 11), hit: null },
    ]);
    expect(effects).toEqual([{ type: "tap" }]);
    expect(state.phase).toBe("idle");
  });

  it("moving past the slop drags, and releasing snaps where the finger was", () => {
    const { state, effects } = run([
      { type: "down", point: at(10, 10) },
      { type: "move", point: at(10 + DRAG_SLOP + 1, 10), hit: null },
      { type: "move", point: at(200, 300), hit: null },
      { type: "up", point: at(200, 300), hit: null },
    ]);
    expect(effects).toEqual([{ type: "snap", drop: at(200, 300) }]);
    expect(state.phase).toBe("idle");
  });

  it("a hold without moving opens the fan, and releasing on nothing keeps it open", () => {
    const { state, effects } = run([
      { type: "down", point: at(10, 10) },
      { type: "holdElapsed" },
      { type: "up", point: at(10, 10), hit: null },
    ]);
    expect(effects).toEqual([{ type: "openFan" }]);
    expect(state).toEqual({ phase: "fan", hover: null });
  });

  it("sliding onto a favorite and lifting selects it and closes the fan", () => {
    const { state, effects } = run([
      { type: "down", point: at(10, 10) },
      { type: "holdElapsed" },
      { type: "move", point: at(80, 40), hit: { kind: "favorite", index: 1 } },
      { type: "up", point: at(80, 40), hit: { kind: "favorite", index: 1 } },
    ]);
    expect(effects).toEqual([
      { type: "openFan" },
      { type: "select", target: { kind: "favorite", index: 1 } },
      { type: "closeFan" },
    ]);
    expect(state.phase).toBe("idle");
  });

  it("tracks which item is hovered while sliding", () => {
    const { state } = run([
      { type: "down", point: at(10, 10) },
      { type: "holdElapsed" },
      { type: "move", point: at(80, 40), hit: { kind: "settings" } },
    ]);
    expect(state).toEqual({ phase: "fan", hover: { kind: "settings" } });
  });

  it("a hold that already became a drag does not open the fan", () => {
    const { effects } = run([
      { type: "down", point: at(10, 10) },
      { type: "move", point: at(100, 100), hit: null },
      { type: "holdElapsed" },
    ]);
    expect(effects).toEqual([]);
  });

  it("dismissing an open fan closes it", () => {
    const { state, effects } = run([
      { type: "down", point: at(10, 10) },
      { type: "holdElapsed" },
      { type: "up", point: at(10, 10), hit: null },
      { type: "dismiss" },
    ]);
    expect(effects).toEqual([{ type: "openFan" }, { type: "closeFan" }]);
    expect(state.phase).toBe("idle");
  });
});

describe("carry hold", () => {
  it("charges until the hold time, then is armed", () => {
    expect(carryHold(null, false)).toBe("idle");
    expect(carryHold(0, false)).toBe("charging");
    expect(carryHold(CARRY_HOLD_MS - 1, false)).toBe("charging");
    expect(carryHold(CARRY_HOLD_MS, false)).toBe("armed");
  });

  it("never arms once the pointer strayed before the hold finished", () => {
    expect(carryHold(CARRY_HOLD_MS * 2, true)).toBe("idle");
    expect(carryHold(10, true)).toBe("idle");
  });

  it("strays only past the drag slop", () => {
    expect(strayedFromPress(DRAG_SLOP)).toBe(false);
    expect(strayedFromPress(DRAG_SLOP + 1)).toBe(true);
  });
});
