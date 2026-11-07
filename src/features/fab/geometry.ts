export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  bottom: number;
}

export type Edge = "left" | "right";

export const FAB_SIZE = 64;
export const EDGE_MARGIN = 10;
export const FAVORITE_SIZE = 52;
export const SETTINGS_SIZE = 44;

const MIN_FAN_RADIUS = 108;
const MAX_ARC_DEGREES = 120;
const MAX_STEP_DEGREES = 30;
const SETTINGS_DISTANCE = 132;
const ITEM_GAP = 6;
const SCREEN_PADDING = 6;
const ARC_SCALES = [1, 0.8, 0.65, 0.5, 0.35];
const SHIFTS = [0, ...Array.from({ length: 16 }, (_, i) => [(i + 1) * 5, -(i + 1) * 5]).flat()];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** Resting centre of the button for an edge and a vertical position. */
export function fabCenter(edge: Edge, y: number, viewport: Size, insets: Insets): Point {
  const half = FAB_SIZE / 2;
  return {
    x: edge === "left" ? EDGE_MARGIN + half : viewport.width - EDGE_MARGIN - half,
    y: clamp(
      y,
      insets.top + EDGE_MARGIN + half,
      viewport.height - insets.bottom - EDGE_MARGIN - half,
    ),
  };
}

/** Where the button settles when released at `drop`: the nearer edge, clamped on screen. */
export function snapToEdge(drop: Point, viewport: Size, insets: Insets): { edge: Edge; y: number } {
  const edge: Edge = drop.x < viewport.width / 2 ? "left" : "right";
  return { edge, y: fabCenter(edge, drop.y, viewport, insets).y };
}

export interface FanLayout {
  favorites: Point[];
  settings: Point;
}

export type FanTarget = { kind: "favorite"; index: number } | { kind: "settings" };

interface FanItem {
  center: Point;
  size: number;
}

function polar(origin: Point, radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return { x: origin.x + radius * Math.cos(radians), y: origin.y + radius * Math.sin(radians) };
}

/** Big enough that neighbouring favorites on the arc never touch. */
function radiusFor(stepDegrees: number) {
  if (stepDegrees === 0) return MIN_FAN_RADIUS;
  const chordNeeded = FAVORITE_SIZE + ITEM_GAP;
  return Math.max(MIN_FAN_RADIUS, chordNeeded / (2 * Math.sin((stepDegrees * Math.PI) / 360)));
}

function isValid(items: FanItem[], origin: Point, viewport: Size, insets: Insets) {
  const onScreen = items.every(({ center, size }) => {
    const reach = size / 2 + SCREEN_PADDING;
    return (
      center.x >= reach &&
      center.x <= viewport.width - reach &&
      center.y >= insets.top + reach &&
      center.y <= viewport.height - insets.bottom - reach
    );
  });
  const clearOfButton = items.every(
    ({ center, size }) =>
      Math.hypot(center.x - origin.x, center.y - origin.y) >= (FAB_SIZE + size) / 2 + ITEM_GAP,
  );
  const apart = items.every((a, i) =>
    items.slice(i + 1).every((b) => {
      const gap = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);
      return gap >= (a.size + b.size) / 2 + ITEM_GAP / 2;
    }),
  );
  return onScreen && clearOfButton && apart;
}

/**
 * Favorites sit on an arc opening away from the edge, listed top to bottom. Settings is tucked
 * on the edge column above or below the button, farther out than the arc, so it never reads as
 * a favorite. When the button is near the top or bottom the arc rotates, settings may flip
 * sides, and finally the arc compacts (smaller steps, larger radius) until everything fits.
 */
export function fanLayout(
  origin: Point,
  edge: Edge,
  viewport: Size,
  insets: Insets,
  favoriteCount: number,
): FanLayout {
  const inward = edge === "left" ? 0 : 180;
  const direction = edge === "left" ? 1 : -1;
  const nominalStep =
    favoriteCount > 1 ? Math.min(MAX_STEP_DEGREES, MAX_ARC_DEGREES / (favoriteCount - 1)) : 0;
  const roomBelow = viewport.height - insets.bottom - origin.y;
  const roomAbove = origin.y - insets.top;
  const preferred = roomBelow >= roomAbove ? 1 : -1;

  const place = (scale: number, shift: number, side: number): FanLayout => {
    const step = nominalStep * scale;
    const radius = radiusFor(step);
    return {
      favorites: Array.from({ length: favoriteCount }, (_, i) =>
        polar(origin, radius, inward + direction * (shift + (i - (favoriteCount - 1) / 2) * step)),
      ),
      settings: { x: origin.x, y: origin.y + side * Math.max(SETTINGS_DISTANCE, radius + 30) },
    };
  };
  const items = (layout: FanLayout): FanItem[] => [
    ...layout.favorites.map((center) => ({ center, size: FAVORITE_SIZE })),
    { center: layout.settings, size: SETTINGS_SIZE },
  ];

  for (const scale of favoriteCount > 1 ? ARC_SCALES : [1]) {
    for (const shift of SHIFTS) {
      for (const side of [preferred, -preferred]) {
        const layout = place(scale, shift, side);
        if (isValid(items(layout), origin, viewport, insets)) return layout;
      }
    }
  }
  return place(1, 0, preferred);
}

const TOUCH_SLACK = 10;

/** The fan item under a finger, with a little slack so a thumb can slide onto it. */
export function fanTargetAt(point: Point, layout: FanLayout): FanTarget | null {
  const near = (center: Point, size: number) =>
    Math.hypot(point.x - center.x, point.y - center.y) <= size / 2 + TOUCH_SLACK;
  const index = layout.favorites.findIndex((p) => near(p, FAVORITE_SIZE));
  if (index >= 0) return { kind: "favorite", index };
  return near(layout.settings, SETTINGS_SIZE) ? { kind: "settings" } : null;
}
