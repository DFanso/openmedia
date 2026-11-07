/** The section of a page at the root of its site. */
export const HOME_SECTION = "/";
/** The section of every page whose first path segment is not a plain lowercase word. */
export const OTHER_SECTION = "*";

const PLAIN_SEGMENT = /^[a-z0-9_-]{1,24}$/;
const DIGITS_ONLY = /^[0-9]+$/;
const PLAIN_HOST = /^[a-z0-9.-]{1,253}$/;

/** What a stretch of time is recorded against: a site and an area of it. Never a full address. */
export interface UsageTarget {
  host: string;
  section: string;
}

/**
 * The area of a site a page belongs to, from the first path segment only. A segment is kept when
 * it is 1-24 lowercase letters, digits, `_` or `-` and not just digits; an empty path is home and
 * anything else (handles, ids, non-Latin text) is `OTHER_SECTION`. Queries, fragments and the
 * rest of the path never reach the result.
 */
export function sectionOf(pathname: string): string {
  const segment = pathname.split("/")[1]?.toLowerCase() ?? "";
  if (segment === "") return HOME_SECTION;
  if (!PLAIN_SEGMENT.test(segment) || DIGITS_ONLY.test(segment)) return OTHER_SECTION;
  return `/${segment}`;
}

/**
 * What to record for a page: its `scope` (the registrable domain the native side pinned it to)
 * or else its host, and the section. `null` for anything that is not a plain web address.
 */
export function usageTargetOf(url: string, scope: string | null): UsageTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = (scope ?? parsed.hostname).toLowerCase();
  if (!PLAIN_HOST.test(host)) return null;
  return { host, section: sectionOf(parsed.pathname) };
}
