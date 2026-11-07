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
import { GearIcon } from "../../shared/icons";
import logoMark from "../../assets/logo-mark.svg";

const idle: GestureState = { phase: "idle" };

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
          className={`fan-item glass fixed z-20 grid place-items-center rounded-full text-lg font-medium ${
            hover?.kind === "favorite" && hover.index === index ? "border-accent! text-accent" : ""
          }`}
        >
          {monogram(favorite.name)}
          <span
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[11px] font-medium tracking-[0.14em] whitespace-nowrap text-paper uppercase ${
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
        <GearIcon />
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
          transform: `translate(${center.x - FAB_SIZE / 2}px, ${center.y - FAB_SIZE / 2}px)${
            gesture.phase === "pressing" ? " scale(0.94)" : ""
          }`,
          transition: gesture.phase === "dragging" ? "none" : "transform 320ms var(--ease-spring)",
          touchAction: "none",
        }}
        className={`fab fixed top-0 left-0 z-30 grid place-items-center rounded-full ${
          hidden ? "pointer-events-none opacity-0" : ""
        }`}
      >
        <span className="fab-aura" />
        <img src={logoMark} alt="" draggable={false} className="fab-logo relative size-8" />
        <svg className="fab-ring" viewBox="0 0 62 62" aria-hidden="true">
          <circle cx="31" cy="31" r="29" />
        </svg>
      </button>
    </>
  );
}
