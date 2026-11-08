const FADE_MS = 400;
/** The splash never outlasts this, however slow the first page is. */
const MAX_WAIT_MS = 4000;

function minimumVisibleMs(): number {
  if (!import.meta.env.DEV) return 0;
  const seconds = Number(import.meta.env.VITE_SPLASH_MIN_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

export function hideSplash(): void {
  const splash = document.getElementById("splash");
  if (!splash) return;
  const remaining = Math.max(0, minimumVisibleMs() - performance.now());
  window.setTimeout(() => {
    splash.setAttribute("data-hidden", "");
    window.setTimeout(() => splash.remove(), FADE_MS);
  }, remaining);
}

/**
 * Runs `hideSplash` once `isReady` holds after a store change, so the splash covers the page's
 * first load instead of handing over to an empty screen. Gives up after `MAX_WAIT_MS`.
 */
export function hideSplashWhen(
  isReady: () => boolean,
  subscribe: (listener: () => void) => () => void,
): void {
  if (isReady()) {
    hideSplash();
    return;
  }
  const finish = () => {
    window.clearTimeout(giveUp);
    unsubscribe();
    hideSplash();
  };
  const unsubscribe = subscribe(() => {
    if (isReady()) finish();
  });
  const giveUp = window.setTimeout(finish, MAX_WAIT_MS);
}
