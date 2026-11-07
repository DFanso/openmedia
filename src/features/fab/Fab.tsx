import { useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useApp } from "../../app/store";
import { useInsets, useViewport } from "../../shared/viewport";
import {
  FAB_SIZE,
  FAVORITE_SIZE,
  SETTINGS_SIZE,
  fabCenter,
  fanLayout,
  fanTargetAt,
  snapToEdge,
  type FanTarget,
  type Point,
} from "./geometry";
import {
  HOLD_MS,
  reduceGesture,
  type GestureEffect,
  type GestureEvent,
  type GestureState,
} from "./gesture";
import { loadPosition, savePosition, type FabPosition } from "./position";
import { SlidersIcon } from "../../shared/icons";
import logoMark from "../../assets/logo-mark.svg";

const idle: GestureState = { phase: "idle" };

/** The button grows while held so a thumb does not hide the ring; the ring box is 100 px wide. */
const HOLD_SCALE = 1.3;
const HOLD_REACH = 50 * HOLD_SCALE + 6;

const monogram = (name: string) => name.trim().charAt(0).toUpperCase() || "·";

interface FanStyle extends CSSProperties {
  "--dx": string;
  "--dy": string;
  "--i": number;
  "--n": number;
}

/**
 * The floating button. Tap: assistant. Drag: move, then snap to the nearer edge. Hold: fan out
 * the favorites and settings; slide onto one and lift, or lift and tap.
 */
export function Fab() {
  const favorites = useApp((s) => s.state?.favorites);
  const sheet = useApp((s) => s.sheet);
  const openSheet = useApp((s) => s.openSheet);
  const goTo = useApp((s) => s.goTo);
  const onboardingOpen = useApp((s) => s.onboardingOpen);
  const viewport = useViewport();
  const insets = useInsets();

  const [position, setPosition] = useState<FabPosition>(loadPosition);
  const [gesture, setGesture] = useState<GestureState>(idle);
  const gestureRef = useRef<GestureState>(idle);
  const holdTimer = useRef(0);
  const ignorePress = useRef(false);

  const list = useMemo(() => favorites ?? [], [favorites]);
  const resting = fabCenter(position.edge, position.yRatio * viewport.height, viewport, insets);
  const layout = useMemo(
    () => fanLayout(resting, position.edge, viewport, insets, list.length),
    // resting is derived from these inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, viewport, insets, list.length],
  );

  const center: Point = gesture.phase === "dragging" ? gesture.position : resting;
  const fanOpen = gesture.phase === "fan";
  const hover = gesture.phase === "fan" ? gesture.hover : null;

  const select = (target: FanTarget) => {
    if (target.kind === "settings") openSheet("settings");
    else if (list[target.index]) goTo(list[target.index].url);
  };

  const apply = (effect: GestureEffect) => {
    switch (effect.type) {
      case "tap":
        openSheet("assistant");
        break;
      case "snap": {
        const next = snapToEdge(effect.drop, viewport, insets);
        const stored = { edge: next.edge, yRatio: next.y / viewport.height };
        setPosition(stored);
        savePosition(stored);
        break;
      }
      case "select":
        select(effect.target);
        break;
      case "openFan":
      case "closeFan":
        break;
    }
  };

  const dispatch = (event: GestureEvent) => {
    const step = reduceGesture(gestureRef.current, event);
    gestureRef.current = step.state;
    setGesture(step.state);
    step.effects.forEach(apply);
  };

  const pointOf = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY });
  const hitAt = (point: Point) =>
    gestureRef.current.phase === "fan" ? fanTargetAt(point, layout) : null;

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // capture is best-effort: the pointer may already be gone
    }
    if (gestureRef.current.phase === "fan") {
      ignorePress.current = true;
      dispatch({ type: "dismiss" });
      return;
    }
    dispatch({ type: "down", point: pointOf(event) });
    holdTimer.current = window.setTimeout(() => dispatch({ type: "holdElapsed" }), HOLD_MS);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (ignorePress.current) return;
    const point = pointOf(event);
    if (gestureRef.current.phase === "dragging") clearTimeout(holdTimer.current);
    dispatch({ type: "move", point, hit: hitAt(point) });
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    clearTimeout(holdTimer.current);
    if (ignorePress.current) {
      ignorePress.current = false;
      return;
    }
    const point = pointOf(event);
    dispatch({ type: "up", point, hit: hitAt(point) });
  };

  const onPointerCancel = () => {
    clearTimeout(holdTimer.current);
    ignorePress.current = false;
    dispatch({ type: "dismiss" });
  };

  const fanStyle = (target: Point, index: number): FanStyle => ({
    left: target.x,
    top: target.y,
    "--dx": `${center.x - target.x}px`,
    "--dy": `${center.y - target.y}px`,
    "--i": index,
    "--n": list.length,
  });

  const hidden = sheet !== "none" || onboardingOpen;
  const holdState = gesture.phase === "pressing" ? "charging" : fanOpen ? "open" : "idle";
  const enlarged = gesture.phase === "pressing" || fanOpen;
  // While enlarged the ring reaches past the screen edge; slide the button inward to keep it whole.
  const edgeGap = position.edge === "left" ? center.x : viewport.width - center.x;
  const inwardShift = enlarged ? Math.max(0, HOLD_REACH - edgeGap) : 0;
  const shiftX = position.edge === "left" ? inwardShift : -inwardShift;

  return (
    <>
      <div
        data-hit={fanOpen ? "" : undefined}
        onPointerDown={() => dispatch({ type: "dismiss" })}
        className={`fixed inset-0 bg-black/45 transition-opacity duration-200 ${
          fanOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {list.map((favorite, index) => (
        <button
          key={favorite.id}
          type="button"
          data-open={fanOpen}
          aria-label={`Open ${favorite.name}`}
          tabIndex={fanOpen ? 0 : -1}
          onClick={() => {
            select({ kind: "favorite", index });
            dispatch({ type: "dismiss" });
          }}
          style={{
            ...fanStyle(layout.favorites[index] ?? resting, index),
            width: FAVORITE_SIZE,
            height: FAVORITE_SIZE,
            margin: -FAVORITE_SIZE / 2,
          }}
          className={`fan-item glass fixed z-20 grid place-items-center rounded-full bg-white/90! text-lg font-medium text-on-accent ${
            hover?.kind === "favorite" && hover.index === index ? "ring-2 ring-accent" : ""
          }`}
        >
          {favorite.icon ? (
            <img src={favorite.icon} alt="" draggable={false} className="size-7 rounded-md" />
          ) : (
            monogram(favorite.name)
          )}
          <span
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] font-medium tracking-[0.14em] whitespace-nowrap text-white uppercase [text-shadow:0_1px_6px_rgb(0_0_0/0.7)] ${
              position.edge === "left" ? "left-full ml-3" : "right-full mr-3 text-right"
            }`}
          >
            {favorite.name}
          </span>
        </button>
      ))}

      <button
        type="button"
        data-open={fanOpen}
        aria-label="Settings"
        tabIndex={fanOpen ? 0 : -1}
        onClick={() => {
          select({ kind: "settings" });
          dispatch({ type: "dismiss" });
        }}
        style={{
          ...fanStyle(layout.settings, list.length),
          width: SETTINGS_SIZE,
          height: SETTINGS_SIZE,
          margin: -SETTINGS_SIZE / 2,
        }}
        className={`fan-item glass fixed z-20 grid place-items-center rounded-full ${
          hover?.kind === "settings" ? "border-accent! text-accent" : "text-paper/80"
        }`}
      >
        <SlidersIcon />
      </button>

      <button
        type="button"
        data-hit={hidden ? undefined : ""}
        data-hold={holdState}
        aria-label="Assistant. Hold for favorites."
        aria-expanded={fanOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          width: FAB_SIZE,
          height: FAB_SIZE,
          transform: `translate(${center.x + shiftX - FAB_SIZE / 2}px, ${center.y - FAB_SIZE / 2}px)${
            enlarged ? ` scale(${HOLD_SCALE})` : ""
          }`,
          transition: gesture.phase === "dragging" ? "none" : "transform 320ms var(--ease-spring)",
          touchAction: "none",
        }}
        className={`fab fixed top-0 left-0 z-30 grid place-items-center rounded-full ${
          hidden ? "pointer-events-none opacity-0" : ""
        }`}
      >
        <img src={logoMark} alt="" draggable={false} className="fab-logo relative size-10" />
        <svg className="fab-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="47" />
        </svg>
      </button>
    </>
  );
}
