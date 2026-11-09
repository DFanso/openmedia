import { describe, expect, it } from "vitest";
import {
  EDGE_ZONE,
  SWIPE_DISTANCE,
  backSide,
  startsAtEdge,
  swipedBack,
  type Side,
} from "./edgeSwipe";

const width = 400;

describe("edge swipe back", () => {
  it("starts only inside the edge zone of the reading side", () => {
    expect(startsAtEdge(EDGE_ZONE, width, "left")).toBe(true);
    expect(startsAtEdge(EDGE_ZONE + 1, width, "left")).toBe(false);
    expect(startsAtEdge(width - EDGE_ZONE, width, "right")).toBe(true);
    expect(startsAtEdge(width - EDGE_ZONE - 1, width, "right")).toBe(false);
    expect(startsAtEdge(width - 1, width, "left")).toBe(false);
  });

  it("uses the right edge for right-to-left languages", () => {
    expect(backSide("ltr")).toBe("left");
    expect(backSide("rtl")).toBe("right");
  });

  it.each<[Side, number]>([
    ["left", 1],
    ["right", -1],
  ])("completes after travelling inward from the %s edge", (side, direction) => {
    const start = { x: side === "left" ? 10 : width - 10, y: 300 };
    const near = { x: start.x + direction * (SWIPE_DISTANCE - 1), y: 300 };
    const far = { x: start.x + direction * SWIPE_DISTANCE, y: 300 };

    expect(swipedBack(start, near, side)).toBe(false);
    expect(swipedBack(start, far, side)).toBe(true);
  });

  it("ignores travel toward the edge and mostly vertical drags", () => {
    const start = { x: 10, y: 300 };

    expect(swipedBack(start, { x: -200, y: 300 }, "left")).toBe(false);
    expect(swipedBack(start, { x: 10 + SWIPE_DISTANCE, y: 300 + SWIPE_DISTANCE }, "left")).toBe(
      false,
    );
  });
});
