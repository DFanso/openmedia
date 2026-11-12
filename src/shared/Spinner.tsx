import type { ReactNode } from "react";

/**
 * The app's one loading ring: an accent arc over a faint track. It stops spinning under reduced
 * motion, where it stays a still ring.
 */
export function Spinner({
  label,
  size = 20,
  className = "",
}: {
  /** Text beside the ring. It is announced when the ring appears. */
  label?: ReactNode;
  /** The ring's diameter, in pixels. */
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-3 text-sm text-paper/55 ${className}`}
    >
      <span
        aria-hidden="true"
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border-2 border-paper/15 border-t-accent motion-safe:animate-spin"
      />
      {label}
    </span>
  );
}
