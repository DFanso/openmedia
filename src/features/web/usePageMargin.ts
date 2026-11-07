import { useEffect, useState } from "react";
import { useApp } from "../../app/store";
import { library } from "../../shared/ipc";

/**
 * Pixels to keep clear under the page now showing: its site's own margin, else the shared one.
 * Rust resolves which site a URL belongs to, so the shell never carries a second URL matcher.
 */
export function usePageMargin(): number {
  const url = useApp((s) => s.page?.url);
  const shared = useApp((s) => s.state?.bottomMargin ?? 0);
  const siteMargins = useApp((s) => s.sites.map((site) => site.bottomMargin ?? "-").join(","));
  const [resolved, setResolved] = useState(shared);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    library
      .bottomMarginFor(url)
      .then((margin) => {
        if (!cancelled) setResolved(margin);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [url, shared, siteMargins]);

  return url ? resolved : shared;
}
