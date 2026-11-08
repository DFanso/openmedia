import { useEffect } from "react";
import { siteView, type Rect } from "../shared/ipc";

const TOUCH_PADDING = 8;

function measureRegions(): Rect[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-hit]"))
    .map((element) => element.getBoundingClientRect())
    .filter((box) => box.width > 0 && box.height > 0)
    .map((box) => ({
      x: box.x - TOUCH_PADDING,
      y: box.y - TOUCH_PADDING,
      width: box.width + 2 * TOUCH_PADDING,
      height: box.height + 2 * TOUCH_PADDING,
    }));
}

/**
 * The shell is transparent and sits above the site view. Touches inside `[data-hit]` elements
 * belong to the shell; everywhere else they fall through to the page. Native code needs those
 * rectangles, so report them whenever layout changes.
 */
export function useHitRegions() {
  useEffect(() => {
    let frame = 0;
    let last = "";

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const regions = measureRegions();
        const key = JSON.stringify(regions);
        if (key === last) return;
        last = key;
        void siteView.setInteractiveRegions(regions).catch(() => {});
      });
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    for (const type of ["resize", "transitionend", "transitioncancel", "animationend"]) {
      window.addEventListener(type, sync, true);
    }
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      for (const type of ["resize", "transitionend", "transitioncancel", "animationend"]) {
        window.removeEventListener(type, sync, true);
      }
    };
  }, []);
}
