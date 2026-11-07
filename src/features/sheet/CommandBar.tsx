import { useState, type FormEvent } from "react";
import { selectPage, useApp } from "../../app/store";
import { errorMessage, siteView, type Favorite } from "../../shared/ipc";
import {
  ArrowIcon,
  BackIcon,
  CloseIcon,
  ForwardIcon,
  PlusIcon,
  ReloadIcon,
} from "../../shared/icons";
import { normalizeWebUrl } from "../../shared/url";
import { MAX_FAVORITES } from "../settings/presets";

const NOT_CONNECTED =
  "The AI assistant isn't connected yet, so only addresses work for now. Type one to open it.";
const NO_FAVORITES: Favorite[] = [];

/** Opens from the top so the keyboard never covers it. Addresses open directly. */
export function CommandBar() {
  const open = useApp((s) => s.sheet === "assistant");
  const page = useApp(selectPage);
  const favorites = useApp((s) => s.state?.favorites) ?? NO_FAVORITES;
  const closeSheet = useApp((s) => s.closeSheet);
  const openAddress = useApp((s) => s.openAddress);
  const saveFavorites = useApp((s) => s.saveFavorites);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const url = normalizeWebUrl(text);
    if (!url) {
      setNotice(text.trim() ? NOT_CONNECTED : null);
      return;
    }
    setText("");
    setNotice(null);
    openAddress(url);
  };

  const run = (action: () => Promise<void>) =>
    void action().catch((error: unknown) => setNotice(errorMessage(error)));

  const canAdd =
    !!page?.url &&
    favorites.length < MAX_FAVORITES &&
    !favorites.some((favorite) => favorite.url === page.url);

  const addCurrent = () => {
    if (!page?.url) return;
    const name = (page.title?.trim() || new URL(page.url).hostname.replace(/^www\./, "")).slice(
      0,
      20,
    );
    void saveFavorites([...favorites, { name, url: page.url }]).then((saved) => {
      setNotice(saved ? `Added ${name} to favorites.` : null);
    });
  };

  const tool = "grid size-11 place-items-center rounded-full text-paper/80 disabled:opacity-25";

  return (
    <div
      data-hit={open ? "" : undefined}
      onPointerDown={closeSheet}
      className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`}
    >
      <section
        data-open={open}
        onPointerDown={(event) => event.stopPropagation()}
        className="command-bar glass absolute inset-x-3 top-[calc(env(safe-area-inset-top)+8px)] rounded-3xl p-3"
      >
        <form onSubmit={submit} className="flex items-center gap-2">
          <input
            aria-label="Address or request"
            autoFocus={open}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            enterKeyHint="go"
            placeholder="Address, or ask for a change"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setNotice(null);
            }}
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-paper outline-none placeholder:text-paper/40"
          />
          <button
            type="submit"
            aria-label="Go"
            className="grid size-11 place-items-center rounded-full bg-accent text-on-accent"
          >
            <ArrowIcon />
          </button>
        </form>

        <p className="min-h-4 px-2 pt-1 text-xs leading-snug text-paper/55">
          {notice ?? (page?.url ? new URL(page.url).host : "")}
        </p>

        <div className="mt-2 flex items-center justify-between border-t border-hair pt-2">
          <div className="flex">
            <button
              type="button"
              aria-label="Back"
              disabled={!page?.canGoBack}
              className={tool}
              onClick={() => run(siteView.goBack)}
            >
              <BackIcon />
            </button>
            <button
              type="button"
              aria-label="Forward"
              disabled={!page?.canGoForward}
              className={tool}
              onClick={() => run(siteView.goForward)}
            >
              <ForwardIcon />
            </button>
            <button
              type="button"
              aria-label="Reload"
              className={tool}
              onClick={() => run(siteView.reload)}
            >
              <ReloadIcon />
            </button>
          </div>
          <div className="flex">
            <button
              type="button"
              aria-label="Add this page to favorites"
              disabled={!canAdd}
              className={tool}
              onClick={addCurrent}
            >
              <PlusIcon />
            </button>
            <button type="button" aria-label="Close" className={tool} onClick={closeSheet}>
              <CloseIcon />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
