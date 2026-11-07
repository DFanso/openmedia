import { useEffect, useRef } from "react";
import { errorMessage, library, siteView } from "../../shared/ipc";
import { useApp } from "../../app/store";
import { usePageMargin } from "./usePageMargin";
import { readRect, useSiteViewRect } from "./useSiteViewRect";

/**
 * The page itself. This component only reserves the rectangle the native site view fills and
 * mirrors page state into the store; the web content is drawn by native code underneath.
 */
export function WebLayer() {
  const slot = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const profileId = useApp((s) => s.state?.profileId);
  const request = useApp((s) => s.request);
  const setPage = useApp((s) => s.setPage);
  const reportError = useApp((s) => s.reportError);

  const bottomMargin = usePageMargin();

  useSiteViewRect(slot);

  useEffect(() => {
    const element = slot.current;
    if (!profileId || !request || !element) return;
    let cancelled = false;
    const action = opened.current
      ? siteView.navigate(request.url)
      : library.openSite(request.url, readRect(element)).then(() => {
          if (!cancelled) opened.current = true;
        });
    action.catch((error: unknown) => reportError(errorMessage(error)));
    return () => {
      cancelled = true;
    };
  }, [profileId, request, reportError]);

  useEffect(() => {
    let lastSaved = "";
    const unlisten = [
      siteView.onState((page) => {
        setPage(page);
        if (!page.loading && page.url && page.url !== lastSaved) {
          lastSaved = page.url;
          void library.setLastUrl(page.url).catch(() => {});
        }
      }),
      siteView.onError(reportError),
    ];
    return () => {
      opened.current = false;
      void siteView.close().catch(() => {});
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [setPage, reportError]);

  return (
    <>
      {!request && (
        <div className="fixed inset-0 grid place-items-center bg-ink p-10 text-center text-paper/60">
          <p className="max-w-60 text-sm leading-relaxed">
            Tap the button and type an address, or hold it to pick a favorite.
          </p>
        </div>
      )}
      <div
        ref={slot}
        aria-hidden="true"
        style={{ bottom: bottomMargin }}
        className="fixed inset-x-0 top-[env(safe-area-inset-top)]"
      />
      <div
        aria-hidden="true"
        style={{ height: bottomMargin }}
        className="fixed inset-x-0 bottom-0 bg-ink"
      />
      <div className="fixed inset-x-0 top-0 h-[env(safe-area-inset-top)] bg-ink" />
    </>
  );
}
