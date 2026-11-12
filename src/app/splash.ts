const FADE_MS = 320;
/** The splash never outlasts this, however slow the first site is. */
const MAX_WAIT_MS = 12_000;

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

/** How far the launch has come: the web view booting, the shell up, the first site drawn. */
export type SplashStage = "boot" | "shell" | "done";

/** Moves the splash's progress track to the stage the launch has reached. */
export function setSplashStage(stage: SplashStage): void {
  const splash = document.getElementById("splash");
  if (splash) splash.dataset.stage = stage;
}

/** Names the site the splash waits for, so the wait says what it is for. */
export function setSplashHost(url: string | null): void {
  const splash = document.getElementById("splash");
  const label = splash?.querySelector(".host");
  if (!splash || !label) return;
  const host = hostOf(url);
  if (!host) {
    delete splash.dataset.host;
    label.textContent = "";
    return;
  }
  splash.dataset.host = host;
  label.textContent = host;
}

/** The host of an address, without a leading "www.". */
function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** What the splash waits for before it lifts. */
export interface StartupProgress {
  /** The shell's web view has booted and loaded its state. */
  shellReady: boolean;
  /** The page the app opened at launch; null when the app opened none. */
  page: PageProgress | null;
  /** The shell could not open the start page. */
  failed: boolean;
}

/**
 * True when there is nothing left to cover: the shell is up and the first site is on screen.
 * The site has to have painted, not merely started loading: a page that commits early still
 * shows an empty view until it draws, and that frame is what the splash exists to hide.
 */
export function splashDone(progress: StartupProgress): boolean {
  if (!progress.shellReady) return false;
  if (progress.failed) return true;
  if (progress.page === null) return true;
  return progress.page.painted;
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
      setSplashStage("done");
      splash.setAttribute("data-hidden", "");
      window.setTimeout(() => {
        splash.remove();
        resolve();
      }, FADE_MS);
    }, remaining);
  });
}

/**
 * Runs `hideSplash` once `isReady` holds after a store change, so the splash covers the first
 * site instead of handing over to an empty screen. Gives up after `MAX_WAIT_MS`.
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
