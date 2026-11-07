import { useEffect, type RefObject } from "react";
import { siteView, type Rect } from "../../shared/ipc";

export function readRect(element: HTMLElement): Rect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

/** Keeps the native site view aligned with a placeholder element: the shell owns layout. */
export function useSiteViewRect(slot: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = slot.current;
    if (!element) return;

    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void siteView.setRect(readRect(element)).catch(() => {}));
    };

    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("resize", sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [slot]);
}
