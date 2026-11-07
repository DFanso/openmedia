import { selectPage, useApp } from "../../app/store";
import { BackIcon } from "../../shared/icons";
import { errorMessage, siteView } from "../../shared/ipc";
import { EDGE_MARGIN } from "../fab/geometry";

/** Optional floating back button (Settings, off by default). Shown only when the page can go back. */
export function BackButton() {
  const enabled = useApp((s) => s.state?.backButton ?? false);
  const canGoBack = useApp((s) => selectPage(s)?.canGoBack ?? false);
  const fabEdge = useApp((s) => s.fabEdge);
  const sheet = useApp((s) => s.sheet);
  const onboardingOpen = useApp((s) => s.onboardingOpen);
  const reportError = useApp((s) => s.reportError);

  if (!enabled || !canGoBack || sheet !== "none" || onboardingOpen) return null;

  return (
    <button
      type="button"
      data-hit=""
      aria-label="Back"
      onClick={() => siteView.goBack().catch((error: unknown) => reportError(errorMessage(error)))}
      style={{ [fabEdge === "left" ? "right" : "left"]: EDGE_MARGIN }}
      className="glass fixed bottom-[calc(env(safe-area-inset-bottom)+10px)] z-10 grid size-12 place-items-center rounded-full text-paper"
    >
      <BackIcon />
    </button>
  );
}
