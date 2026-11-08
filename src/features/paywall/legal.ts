/**
 * The legal pages the paywall links to.
 *
 * The addresses are build-time values (`VITE_PRIVACY_POLICY_URL`, `VITE_TERMS_URL`) so no page is
 * advertised before it exists. A missing or unsafe value means the links are unavailable: the
 * paywall then says so and keeps the purchase buttons off.
 */

interface BuildEnv {
  readonly VITE_PRIVACY_POLICY_URL?: string;
  readonly VITE_TERMS_URL?: string;
}

const env = import.meta.env as unknown as BuildEnv;

/** An address the app may open: absolute and over https. */
function safeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const PRIVACY_POLICY_URL = safeUrl(env.VITE_PRIVACY_POLICY_URL);
export const TERMS_URL = safeUrl(env.VITE_TERMS_URL);

/** True when both legal pages are configured; purchases need them. */
export const legalConfigured = PRIVACY_POLICY_URL !== null && TERMS_URL !== null;
