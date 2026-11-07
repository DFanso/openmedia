import { useEffect, useRef, useState } from "react";
import { MAX_BOTTOM_MARGIN } from "./presets";

interface MarginSliderProps {
  label: string;
  value: number;
  onCommit: (pixels: number) => void;
}

/**
 * Shows the value while dragging and saves once on release. The browser's native `change` event
 * is that release; React's `onChange` fires on every step, and each save rewrites the library.
 */
export function MarginSlider({ label, value, onCommit }: MarginSliderProps) {
  const input = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    commit.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const release = () => {
      commit.current(Number(element.value));
      setDragging(null);
    };
    element.addEventListener("change", release);
    return () => element.removeEventListener("change", release);
  }, []);

  const shown = dragging ?? value;
  return (
    <div className="flex items-center gap-3">
      <input
        ref={input}
        type="range"
        aria-label={label}
        min={0}
        max={MAX_BOTTOM_MARGIN}
        step={4}
        value={shown}
        onChange={(event) => setDragging(Number(event.target.value))}
        className="min-w-0 flex-1 accent-accent"
      />
      <span className="w-14 text-right text-sm text-paper/70 tabular-nums">{shown} px</span>
    </div>
  );
}
