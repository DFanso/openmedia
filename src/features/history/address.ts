/**
 * How a history entry reads: `reddit.com` over `/r/rust` for `https://www.reddit.com/r/rust`. A
 * plain `http` address keeps its scheme so it is not mistaken for its `https` twin.
 */
export function describeAddress(url: string): { host: string; rest: string } {
  try {
    const { protocol, host, pathname, search } = new URL(url);
    const scheme = protocol === "http:" ? "http://" : "";
    return {
      host: `${scheme}${host.replace(/^www\./, "")}`,
      rest: `${pathname === "/" ? "" : pathname}${search}`,
    };
  } catch {
    return { host: url, rest: "" };
  }
}
