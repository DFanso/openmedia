import { useEffect, useRef } from "react";
import { pushBackHandler } from "./backStack";

/** While `active`, Back (the system button or gesture) calls `handler` before it leaves the page. */
export function useBackHandler(active: boolean, handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => latest.current());
  }, [active]);
}
