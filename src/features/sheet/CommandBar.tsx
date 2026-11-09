import { useEffect, useState, type FormEvent } from "react";
import { selectPage, useApp } from "../../app/store";
import { describeError } from "../../i18n/errors";
import { useT } from "../../i18n/useT";
import { displayHost, isFavoriteSite, toggleSiteFavorite } from "../../shared/favorites";
import { siteView, type Favorite } from "../../shared/ipc";
import {
  ArrowIcon,
  BackIcon,
  CloseIcon,
  ForwardIcon,
  ReloadIcon,
  StarIcon,
} from "../../shared/icons";
import { AssistantPanel } from "../ai/AssistantPanel";
import { MAX_REQUEST_LENGTH, routeInput } from "../ai/route";

const NO_FAVORITES: Favorite[] = [];

/** Opens from the top so the keyboard never covers it. Addresses open directly; other text is a request for the assistant. */
export function CommandBar() {
  const open = useApp((s) => s.sheet === "assistant");
  const page = useApp(selectPage);
  const closeSheet = useApp((s) => s.closeSheet);
  const openAddress = useApp((s) => s.openAddress);
  const favorites = useApp((s) => s.state?.favorites) ?? NO_FAVORITES;
  const saveFavorites = useApp((s) => s.saveFavorites);
  const aiState = useApp((s) => s.aiState);
  const assistant = useApp((s) => s.assistant);
  const loadAi = useApp((s) => s.loadAi);
  const submitRequest = useApp((s) => s.submitRequest);
  const openSheet = useApp((s) => s.openSheet);
  const editRequest = useApp((s) => s.editRequest);
  const t = useT();
  const [notice, setNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  // The bar's text lives in the store, so "Ask again" can hand the request back for editing.
  const text = assistant.status === "idle" ? assistant.draft : "";

  useEffect(() => {
    if (open) void loadAi();
  }, [open, loadAi]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const route = routeInput(text, { ai: aiState, pageUrl: page?.url ?? null });
    switch (route.kind) {
      case "empty":
        setNotice(null);
        setBlocked(false);
        return;
      case "address":
        editRequest("");
        setNotice(null);
        setBlocked(false);
        openAddress(route.url);
        return;
      case "blocked":
        setNotice(
          route.reason === "noProvider"
            ? t("assistant.blockedNoProvider")
            : t("assistant.blockedNoPage"),
        );
        setBlocked(route.reason === "noProvider");
        return;
      case "request":
        setNotice(null);
        setBlocked(false);
        void submitRequest(route.request);
    }
  };

  const run = (action: () => Promise<void>) =>
    void action().catch((error: unknown) => setNotice(describeError(error, t)));

  // The live address, or the one the page was opened with until it reports its first state.
  const pageUrl = page?.url ?? page?.openedUrl ?? null;
  const site = pageUrl ? displayHost(pageUrl) : "";
  const favorited = pageUrl ? isFavoriteSite(favorites, pageUrl) : false;
  const starLabel = t(favorited ? "commandBar.removeFavorite" : "commandBar.addFavorite", {
    site,
  });

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
        className="command-bar glass absolute inset-x-3 top-[calc(var(--safe-top)+8px)] rounded-3xl p-3"
      >
        {assistant.status !== "idle" ? (
          <div className="max-h-[70vh] overflow-y-auto">
            <AssistantPanel state={assistant} />
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                aria-label={t("commandBar.addressLabel")}
                autoFocus={open}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
                maxLength={MAX_REQUEST_LENGTH}
                enterKeyHint="go"
                placeholder={t("commandBar.placeholder")}
                value={text}
                onChange={(event) => {
                  editRequest(event.target.value);
                  setNotice(null);
                  setBlocked(false);
                }}
                className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base text-paper outline-none placeholder:text-paper/40"
              />
              <button
                type="submit"
                aria-label={t("commandBar.go")}
                className="grid size-11 place-items-center rounded-full bg-accent text-on-accent"
              >
                <ArrowIcon />
              </button>
            </form>

            <p className="min-h-4 px-2 pt-1 text-xs leading-snug text-paper/55">
              {notice ?? (page?.url ? new URL(page.url).host : "")}
              {blocked && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => openSheet("settings")}
                    className="font-medium text-accent"
                  >
                    {t("commandBar.openAiSettings")}
                  </button>
                </>
              )}
            </p>
          </>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-hair pt-2">
          <div className="flex">
            <button
              type="button"
              aria-label={t("common.back")}
              disabled={!page?.canGoBack}
              className={tool}
              onClick={() => run(siteView.goBack)}
            >
              <BackIcon />
            </button>
            <button
              type="button"
              aria-label={t("commandBar.forward")}
              disabled={!page?.canGoForward}
              className={tool}
              onClick={() => run(siteView.goForward)}
            >
              <ForwardIcon />
            </button>
            <button
              type="button"
              aria-label={t("commandBar.reload")}
              className={tool}
              onClick={() => run(siteView.reload)}
            >
              <ReloadIcon />
            </button>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              aria-pressed={favorited}
              aria-label={starLabel}
              disabled={!pageUrl}
              className={`${tool} ${favorited ? "text-accent" : ""}`}
              onClick={() => {
                if (!pageUrl) return;
                void saveFavorites(toggleSiteFavorite(favorites, pageUrl));
              }}
            >
              <StarIcon filled={favorited} />
            </button>
            <button
              type="button"
              aria-label={t("commandBar.close")}
              className={tool}
              onClick={closeSheet}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
