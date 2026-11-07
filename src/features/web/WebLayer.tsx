import { useEffect, useRef } from "react";
import { errorMessage, library, siteView } from "../../shared/ipc";
import { useApp } from "../../app/store";
import { usePageMargin } from "./usePageMargin";
import { readRect, useSiteViewRect } from "./useSiteViewRect";

/** How often idle and surplus hidden sessions are swept. */
const SWEEP_MS = 60_000;

/**
 * The page itself. This component only reserves the rectangle the native site view fills and
 * mirrors page state into the store; the web content is drawn by native code underneath. Each
 * session is its own native view; this layer opens, shows and sweeps them.
 */
export function WebLayer() {
  const slot = useRef<HTMLDivElement>(null);
  const profileId = useApp((s) => s.state?.profileId);
  const action = useApp((s) => s.action);
  const hasSession = useApp((s) => s.activeId !== null);
  const setSessionState = useApp((s) => s.setSessionState);
  const sessionOpenFailed = useApp((s) => s.sessionOpenFailed);
  const forgetSessions = useApp((s) => s.forgetSessions);
  const trimSessions = useApp((s) => s.trimSessions);
  const reportError = useApp((s) => s.reportError);

  const bottomMargin = usePageMargin();

  useSiteViewRect(slot);

  useEffect(() => {
    const element = slot.current;
    if (!profileId || !action || !element) return;
    const run =
      action.type === "open"
        ? library.openSite(action.id, action.url, readRect(element))
        : siteView.activate(action.id);
    run.catch((error: unknown) => {
      if (action.type === "open") sessionOpenFailed(action.id);
      reportError(errorMessage(error));
    });
  }, [profileId, action, sessionOpenFailed, reportError]);

  useEffect(() => {
    let lastSaved = "";
    const unlisten = [
      siteView.onState((page) => {
        setSessionState(page);
        const visible = useApp.getState().activeId === page.session;
        if (visible && !page.loading && page.url && page.url !== lastSaved) {
          lastSaved = page.url;
          void library.setLastUrl(page.url).catch(() => {});
        }
      }),
      siteView.onClosed((session) => forgetSessions([session])),
      siteView.onMemoryWarning(() => trimSessions("memory")),
      siteView.onError(reportError),
    ];
    const sweep = window.setInterval(() => trimSessions("routine"), SWEEP_MS);
    return () => {
      window.clearInterval(sweep);
      void Promise.all(unlisten).then((fns) => fns.forEach((fn) => fn()));
    };
  }, [setSessionState, forgetSessions, trimSessions, reportError]);

  return (
    <>
      {!hasSession && (
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
