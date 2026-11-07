import { useEffect, useRef, useState } from "react";
import {
  errorMessage,
  siteView,
  type Profile,
  type Site,
  type SiteViewState,
} from "../../shared/ipc";
import { readRect, useSiteViewRect } from "./useSiteViewRect";

interface BrowserViewProps {
  profile: Profile;
  site: Site;
  onClose: () => void;
}

const idleState: SiteViewState = {
  url: null,
  title: null,
  loading: true,
  canGoBack: false,
  canGoForward: false,
};

export function BrowserView({ profile, site, onClose }: BrowserViewProps) {
  const slot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<SiteViewState>(idleState);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const element = slot.current;
    if (!element) return;
    let cancelled = false;
    const unlisten = [siteView.onState(setState), siteView.onError(setError)];

    siteView
      .open(profile.id, site.url, readRect(element))
      .then(() => !cancelled && setOpened(true))
      .catch((e: unknown) => !cancelled && setError(errorMessage(e)));

    return () => {
      cancelled = true;
      void siteView.close().catch(() => {});
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [profile.id, site.url]);

  useSiteViewRect(slot, opened);

  const run = (action: () => Promise<void>) =>
    void action().catch((e: unknown) => setError(errorMessage(e)));

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-0.5 bg-zinc-900 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="truncate text-sm font-medium">{state.title ?? site.title}</div>
        <div className="truncate text-xs text-zinc-500">{state.url ?? site.url}</div>
      </header>

      <div ref={slot} className="relative flex-1 bg-zinc-950">
        {error && <p className="p-4 text-sm text-red-400">{error}</p>}
      </div>

      <nav className="flex items-center justify-around bg-zinc-900 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        <button className="px-4 py-2" onClick={onClose}>
          Home
        </button>
        <button
          className="px-4 py-2 disabled:opacity-30"
          disabled={!state.canGoBack}
          onClick={() => run(siteView.goBack)}
        >
          Back
        </button>
        <button
          className="px-4 py-2 disabled:opacity-30"
          disabled={!state.canGoForward}
          onClick={() => run(siteView.goForward)}
        >
          Forward
        </button>
        <button className="px-4 py-2" onClick={() => run(siteView.reload)}>
          {state.loading ? "…" : "Reload"}
        </button>
      </nav>
    </div>
  );
}
