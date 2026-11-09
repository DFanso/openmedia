import { createMatcher } from "../../shared/public-suffix/match.mjs";
import rules from "../../shared/public-suffix/resources/public_suffix_rules.txt?raw";

const registrable = createMatcher(rules);

/** The host of an address, without its port. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The domain a host belongs to, by the Public Suffix List: `www.instagram.com` and
 * `m.instagram.com` both give `instagram.com`, `news.bbc.co.uk` gives `bbc.co.uk` and
 * `bob.github.io` stays `bob.github.io`. A host without a registrable part (`localhost`, an IP
 * address) is kept whole.
 */
export function registrableDomain(host: string): string {
  const lower = host.toLowerCase().replace(/\.$/, "");
  return registrable(lower) ?? lower;
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
