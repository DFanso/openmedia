const WEB_URL = /^https?:\/\//i;
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** Turns what a user typed into an http(s) URL, or null when it cannot be one. */
export function normalizeWebUrl(input: string): string | null {
  const text = input.trim();
  if (text === "" || /\s/.test(text)) return null;
  if (!WEB_URL.test(text) && OTHER_SCHEME.test(text)) return null;

  let url: URL;
  try {
    url = new URL(WEB_URL.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const hasRealHost = url.hostname.includes(".") || url.hostname === "localhost";
  return hasRealHost ? url.href : null;
}
