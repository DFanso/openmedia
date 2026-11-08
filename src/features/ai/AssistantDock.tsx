import { useApp } from "../../app/store";
import { AssistantPanel } from "./AssistantPanel";

/**
 * Sits at the bottom while the command bar is closed, so the page stays visible under the preview
 * the assistant applied. Long steps (reading, sending) show only a chip.
 */
export function AssistantDock() {
  const assistant = useApp((s) => s.assistant);
  const sheet = useApp((s) => s.sheet);
  const openSheet = useApp((s) => s.openSheet);
  const cancel = useApp((s) => s.cancelAssistant);
  if (sheet !== "none" || assistant.status === "idle") return null;

  const card =
    assistant.status === "proposal" ||
    assistant.status === "accepting" ||
    assistant.status === "accepted" ||
    assistant.status === "rejected";

  return (
    <section
      aria-label="AI assistant"
      data-hit=""
      className="assistant-dock glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-40 max-h-[70vh] overflow-y-auto rounded-3xl p-3"
    >
      {card ? (
        <AssistantPanel state={assistant} />
      ) : (
        <div className="flex items-center justify-between gap-3 px-2 text-sm text-paper/80">
          <span>
            {assistant.status === "preparing" || assistant.status === "sending"
              ? "The assistant is working…"
              : "The assistant needs you."}
          </span>
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => cancel()}
              className="rounded-full border border-hair px-4 py-2 text-sm font-medium text-paper/85"
            >
              Cancel
            </button>
            {(assistant.status === "preview" || assistant.status === "error") && (
              <button
                type="button"
                onClick={() => openSheet("assistant")}
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent"
              >
                Review
              </button>
            )}
          </span>
        </div>
      )}
    </section>
  );
}
