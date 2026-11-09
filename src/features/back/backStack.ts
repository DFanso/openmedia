type BackHandler = () => void;

const handlers: BackHandler[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/**
 * Something on screen that Back should dismiss before it leaves the page: the fan, a sheet, an
 * onboarding step. The newest handler runs first. Returns the function that removes it.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler);
  notify();
  return () => {
    const index = handlers.lastIndexOf(handler);
    if (index === -1) return;
    handlers.splice(index, 1);
    notify();
  };
}

/** Runs the newest handler. False when nothing on screen wants the press. */
export function runBackHandler(): boolean {
  const handler = handlers[handlers.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

export const hasBackHandler = () => handlers.length > 0;

export function subscribeBackHandlers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
