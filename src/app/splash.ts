const FADE_MS = 250;
/** The splash never outlasts this, however slow the first page is. */
const MAX_WAIT_MS = 4000;

/** What the splash needs to know about the page under it. */
export interface PageProgress {
  painted: boolean;
  loading: boolean;
  url: string | null;
}

/**
 * True once uncovering the screen shows something: no page to wait for, the page has drawn its
 * first content, or it stopped loading with an address (a finished or failed load). A page that
 * has not reported an address is only just being opened, and is still ahead of its first paint.
 */
export function pageShowing(page: PageProgress | null): boolean {
  return page === null || page.painted || (!page.loading && page.url !== null);
}

function minimumVisibleMs(): number {
  if (!import.meta.env.DEV) return 0;
  const seconds = Number(import.meta.env.VITE_SPLASH_MIN_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/** Fades the splash out and removes it. Resolves once it is gone. */
export function hideSplash(): Promise<void> {
  const splash = document.getElementById("splash");
  if (!splash) return Promise.resolve();
  const remaining = Math.max(0, minimumVisibleMs() - performance.now());
  return new Promise((resolve) => {
    window.setTimeout(() => {
      splash.setAttribute("data-hidden", "");
      window.setTimeout(() => {
        splash.remove();
        resolve();
      }, FADE_MS);
    }, remaining);
  });
}

/**
 * Runs `hideSplash` once `isReady` holds after a store change, so the splash covers the page's
 * first load instead of handing over to an empty screen. Gives up after `MAX_WAIT_MS`.
 */
export function hideSplashWhen(
  isReady: () => boolean,
  subscribe: (listener: () => void) => () => void,
): Promise<void> {
  if (isReady()) return hideSplash();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(giveUp);
      unsubscribe();
      void hideSplash().then(resolve);
    };
    const unsubscribe = subscribe(() => {
      if (isReady()) finish();
    });
    const giveUp = window.setTimeout(finish, MAX_WAIT_MS);
  });
}
