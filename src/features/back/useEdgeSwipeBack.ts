import { useEffect, useRef, type RefObject } from "react";
import { backSide, startsAtEdge, swipedBack, type Side, type TouchPoint } from "./edgeSwipe";

/**
 * The iOS back gesture on the app's own full-screen pages: a swipe from the reading-side edge
 * calls `onBack`. Pages in the site view keep the web view's own swipe; this covers the shell.
 */
export function useEdgeSwipeBack(ref: RefObject<HTMLElement | null>, onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let origin: (TouchPoint & { side: Side }) | null = null;

    const begin = (event: TouchEvent) => {
      const touch = event.touches[0];
      const side = backSide(document.documentElement.dir);
      const onControl = event.target instanceof Element && event.target.closest("input, select");
      origin =
        event.touches.length === 1 &&
        touch &&
        !onControl &&
        startsAtEdge(touch.clientX, window.innerWidth, side)
          ? { x: touch.clientX, y: touch.clientY, side }
          : null;
    };
    const track = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!origin || !touch) return;
      if (swipedBack(origin, { x: touch.clientX, y: touch.clientY }, origin.side)) {
        origin = null;
        latest.current();
      }
    };
    const end = () => {
      origin = null;
    };

    element.addEventListener("touchstart", begin, { passive: true });
    element.addEventListener("touchmove", track, { passive: true });
    element.addEventListener("touchend", end, { passive: true });
    element.addEventListener("touchcancel", end, { passive: true });
    return () => {
      element.removeEventListener("touchstart", begin);
      element.removeEventListener("touchmove", track);
      element.removeEventListener("touchend", end);
      element.removeEventListener("touchcancel", end);
    };
  }, [ref]);
}
