import { describe, expect, it } from "vitest";
import {
  FAB_SIZE,
  FAVORITE_SIZE,
  SETTINGS_SIZE,
  fabCenter,
  fanLayout,
  fanTargetAt,
  snapToEdge,
  type Edge,
  type Insets,
  type Point,
} from "./geometry";

const phone = { width: 393, height: 852 };
const insets: Insets = { top: 59, bottom: 34 };

describe("snapToEdge", () => {
  it("picks the nearer edge", () => {
    expect(snapToEdge({ x: 100, y: 400 }, phone, insets).edge).toBe("left");
    expect(snapToEdge({ x: 300, y: 400 }, phone, insets).edge).toBe("right");
  });

  it("keeps the button inside the safe area", () => {
    const top = snapToEdge({ x: 10, y: -500 }, phone, insets);
    const bottom = snapToEdge({ x: 10, y: 5000 }, phone, insets);
    expect(fabCenter("left", top.y, phone, insets).y - FAB_SIZE / 2).toBeGreaterThanOrEqual(
      insets.top,
    );
    expect(fabCenter("left", bottom.y, phone, insets).y + FAB_SIZE / 2).toBeLessThanOrEqual(
      phone.height - insets.bottom,
    );
  });
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

describe("fanLayout", () => {
  const edges: Edge[] = ["left", "right"];
  const heights = [insets.top, 200, 426, 700, phone.height - insets.bottom];

  for (const edge of edges) {
    for (const y of heights) {
      for (const count of [0, 1, 2, 4, 6]) {
        it(`keeps ${count} favorites on screen and apart (${edge} edge, y=${y})`, () => {
          const origin = fabCenter(edge, y, phone, insets);
          const layout = fanLayout(origin, edge, phone, insets, count);
          const items = [
            ...layout.favorites.map((center) => ({ center, size: FAVORITE_SIZE })),
            { center: layout.settings, size: SETTINGS_SIZE },
          ];
          for (const { center, size } of items) {
            expect(center.x - size / 2).toBeGreaterThanOrEqual(0);
            expect(center.x + size / 2).toBeLessThanOrEqual(phone.width);
            expect(center.y - size / 2).toBeGreaterThanOrEqual(insets.top);
            expect(center.y + size / 2).toBeLessThanOrEqual(phone.height - insets.bottom);
          }
          for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
              const gap = distance(items[i].center, items[j].center);
              expect(gap).toBeGreaterThanOrEqual((items[i].size + items[j].size) / 2);
            }
          }
        });
      }
    }
  }

  it("lists favorites top to bottom on both edges", () => {
    for (const edge of edges) {
      const layout = fanLayout(fabCenter(edge, 426, phone, insets), edge, phone, insets, 4);
      const ys = layout.favorites.map((p) => p.y);
      expect(ys).toEqual([...ys].sort((a, b) => a - b));
    }
  });

  it("opens away from the edge the button rests on", () => {
    const left = fanLayout(fabCenter("left", 426, phone, insets), "left", phone, insets, 4);
    const right = fanLayout(fabCenter("right", 426, phone, insets), "right", phone, insets, 4);
    expect(left.favorites.every((p) => p.x > FAB_SIZE)).toBe(true);
    expect(right.favorites.every((p) => p.x < phone.width - FAB_SIZE)).toBe(true);
  });

  it("puts settings farther out than every favorite and clear of the arc", () => {
    const origin = fabCenter("right", 426, phone, insets);
    const layout = fanLayout(origin, "right", phone, insets, 4);
    const settings = distance(origin, layout.settings);
    for (const favorite of layout.favorites) {
      expect(settings).toBeGreaterThan(distance(origin, favorite));
      expect(distance(layout.settings, favorite)).toBeGreaterThan(FAVORITE_SIZE);
    }
  });
});

describe("fanTargetAt", () => {
  const origin = fabCenter("left", 426, phone, insets);
  const layout = fanLayout(origin, "left", phone, insets, 4);

  it("finds the item under the finger", () => {
    expect(fanTargetAt(layout.favorites[2], layout)).toEqual({ kind: "favorite", index: 2 });
    expect(fanTargetAt(layout.settings, layout)).toEqual({ kind: "settings" });
  });

  it("returns null away from every item", () => {
    expect(fanTargetAt({ x: 380, y: 10 }, layout)).toBeNull();
  });
});
