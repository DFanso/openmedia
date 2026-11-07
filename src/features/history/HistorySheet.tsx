import { useApp } from "../../app/store";
import { CloseIcon } from "../../shared/icons";
import { describeAddress } from "./address";

const NO_HISTORY: string[] = [];

/** Addresses the user typed, newest first. Full-screen so nothing from the page shows through. */
export function HistorySheet() {
  const open = useApp((s) => s.sheet === "history");
  const history = useApp((s) => s.state?.history) ?? NO_HISTORY;
  const closeSheet = useApp((s) => s.closeSheet);
  const openHistory = useApp((s) => s.openHistory);
  if (!open) return null;

  return (
    <div data-hit="" className="fixed inset-0 z-50 flex flex-col bg-ink">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
        <h1 className="text-xs font-medium tracking-[0.22em] text-paper/60 uppercase">History</h1>
        <button
          type="button"
          aria-label="Close history"
          onClick={closeSheet}
          className="grid size-11 place-items-center rounded-full text-paper/80"
        >
          <CloseIcon />
        </button>
      </header>

      {history.length === 0 ? (
        <p className="px-5 pt-6 text-sm leading-relaxed text-paper/55">
          Sites you search for appear here. Clear them any time in Settings.
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 pb-[calc(env(safe-area-inset-bottom)+32px)]">
          {history.map((url) => {
            const { host, rest } = describeAddress(url);
            return (
              <li key={url}>
                <button
                  type="button"
                  onClick={() => openHistory(url)}
                  className="block w-full rounded-2xl px-3 py-3 text-left active:bg-paper/[0.06]"
                >
                  <span className="block truncate text-base text-paper">{host}</span>
                  {rest && (
                    <span className="mt-0.5 block truncate text-xs text-paper/45 tabular-nums">
                      {rest}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
