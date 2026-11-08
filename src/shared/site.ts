/** Second-level labels under a two-letter country code, as the site view uses them. */
const COUNTRY_SECOND_LEVEL: Record<string, true> = {
  ac: true,
  com: true,
  co: true,
  edu: true,
  go: true,
  gob: true,
  gov: true,
  mil: true,
  ne: true,
  net: true,
  or: true,
  org: true,
};

/** The host of an address, without its port. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The domain a host belongs to: `www.instagram.com` and `m.instagram.com` both give
 * `instagram.com`. A host without a registrable part is kept whole.
 */
export function registrableDomain(host: string): string {
  const lower = host.toLowerCase().replace(/\.$/, "");
  const labels = lower.split(".").filter(Boolean);
  if (labels.length <= 2 || labels.every((label) => /^\d+$/.test(label))) return lower;
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  const keep = tld.length === 2 && COUNTRY_SECOND_LEVEL[second] === true ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/**
 * The site an address belongs to: the part of the host the site owns, so `m.youtube.com` and
 * `youtube.com` are one site and `news.bbc.co.uk` is `bbc.co.uk`. The rule is the one the site
 * view pins sessions to, so a favorite and the page it opens are the same site.
 */
export function siteOf(url: string): string | null {
  const host = hostOf(url);
  return host ? registrableDomain(host) : null;
}
