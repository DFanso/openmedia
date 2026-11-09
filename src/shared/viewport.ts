import { useEffect, useState } from "react";
import type { Insets, Size } from "../features/fab/geometry";

export function useViewport(): Size {
  const [size, setSize] = useState<Size>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

/** Safe-area insets in CSS pixels, measured through a hidden probe element. */
export function useInsets(): Insets {
  const [insets, setInsets] = useState<Insets>({ top: 0, bottom: 0 });
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding-top:var(--safe-top);padding-bottom:var(--safe-bottom)";
    document.body.append(probe);
    const measure = () => {
      const style = getComputedStyle(probe);
      const next = {
        top: Number.parseFloat(style.paddingTop) || 0,
        bottom: Number.parseFloat(style.paddingBottom) || 0,
      };
      setInsets((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      probe.remove();
    };
  }, []);
  return insets;
}
