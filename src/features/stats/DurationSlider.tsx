import { useEffect, useRef, type CSSProperties } from "react";
import { useT } from "../../i18n/useT";
import { formatDuration } from "./format";

interface DurationSliderProps {
  label: string;
  /** Minutes the thumb snaps to, ascending. */
  stops: readonly number[];
  /** Minutes; one of `stops`. */
  value: number;
  /** Fires on every step of a drag, so the screen can follow the thumb. */
  onScrub: (minutes: number) => void;
  /** Fires once on release (or on each keyboard step); this is the moment to save. */
  onCommit: (minutes: number) => void;
}

const THUMB_PX = 28;

/**
 * A slider over uneven stops: five-minute steps where they matter, then half an hour, then hours.
 * The browser's own `change` event is the release; React's `onChange` runs on every step.
 */
export function DurationSlider({ label, stops, value, onScrub, onCommit }: DurationSliderProps) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ stops, onCommit });

  useEffect(() => {
    latest.current = { stops, onCommit };
  }, [stops, onCommit]);

  useEffect(() => {
    const element = input.current;
    if (!element) return;
    const release = () => {
      const minutes = latest.current.stops[Number(element.value)];
      if (minutes !== undefined) latest.current.onCommit(minutes);
    };
    element.addEventListener("change", release);
    return () => element.removeEventListener("change", release);
  }, []);

  const index = Math.max(0, stops.indexOf(value));
  const ratio = stops.length > 1 ? index / (stops.length - 1) : 0;
  const text = formatDuration(value * 60, t);
  return (
    <div className="flex items-center gap-4">
      <input
        ref={input}
        type="range"
        aria-label={label}
        aria-valuetext={text}
        min={0}
        max={Math.max(stops.length - 1, 1)}
        step={1}
        value={index}
        onChange={(event) => {
          const minutes = stops[Number(event.target.value)];
          if (minutes !== undefined) onScrub(minutes);
        }}
        className="range min-w-0 flex-1"
        style={
          {
            "--fill": `calc(${ratio} * (100% - ${THUMB_PX}px) + ${THUMB_PX / 2}px)`,
          } as CSSProperties
        }
      />
      <span className="w-[4.5rem] shrink-0 text-end text-lg font-semibold tabular-nums">
        {text}
      </span>
    </div>
  );
}
