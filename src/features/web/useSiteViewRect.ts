import { useEffect, type RefObject } from "react";
import { siteView, type Rect } from "../../shared/ipc";

export function readRect(element: HTMLElement): Rect {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

/**
 * Keeps the native site view aligned with a placeholder element: the shell owns layout.
 *
 * One `setRect` is in flight at a time and the rectangle is read when it is sent, not when it was
 * asked for, so an older rectangle (taken before the layout settled) can never land after a newer
 * one and stay on screen as a strip of empty space.
 */
export function useSiteViewRect(slot: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = slot.current;
    if (!element) return;

    let frame = 0;
    let sending = false;
    let changedWhileSending = false;
    let disposed = false;

    const send = () => {
      if (sending) {
        changedWhileSending = true;
        return;
      }
      sending = true;
      changedWhileSending = false;
      void siteView
        .setRect(readRect(element))
        .catch(() => {})
        .finally(() => {
          sending = false;
          if (changedWhileSending && !disposed) send();
        });
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(send);
    };

    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("resize", sync);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [slot]);
}
