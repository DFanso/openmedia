// The Public Suffix List matcher shared by the app (TypeScript) and the build scripts (Node).
// The data is resources/public_suffix_rules.txt; vectors.json and app-vectors.json are its tests, which
// the Rust, Kotlin and Swift matchers pass as well.

const MAX_LABEL_CHARS = 63;
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * @param {string} rulesText `public_suffix_rules.txt`: one `a.b`, `*.a.b` or `!x.a.b` rule per line
 * @returns {(host: string) => string | null} the registrable domain of a host, or null for an IP
 *   address, a malformed host or a host that is itself a public suffix
 */
export function createMatcher(rulesText) {
  const suffixes = new Set();
  const wildcards = new Set();
  const exceptions = new Set();
  for (const line of rulesText.split("\n")) {
    if (!line) continue;
    if (line.startsWith("!")) exceptions.add(line.slice(1));
    else if (line.startsWith("*.")) wildcards.add(line.slice(2));
    else suffixes.add(line);
  }

  function suffixLength(labels) {
    let longest = 1;
    for (let start = 0; start < labels.length; start++) {
      const candidate = labels.slice(start).join(".");
      if (exceptions.has(candidate)) return labels.length - start - 1;
      const wildcard = start + 1 < labels.length && wildcards.has(labels.slice(start + 1).join("."));
      const length = labels.length - start;
      if ((suffixes.has(candidate) || wildcard) && length > longest) longest = length;
    }
    return longest;
  }

  return (host) => {
    const lower = host.toLowerCase();
    const normalized = lower.endsWith(".") ? lower.slice(0, -1) : lower;
    const labels = normalized.split(".");
    const wellFormed = labels.every((label) => label.length <= MAX_LABEL_CHARS && LABEL.test(label));
    if (!wellFormed || !/[a-z]/.test(labels[labels.length - 1])) return null;
    const suffix = suffixLength(labels);
    return labels.length > suffix ? labels.slice(labels.length - suffix - 1).join(".") : null;
  };
}
