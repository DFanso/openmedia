import { useState } from "react";
import { useApp } from "../../app/store";
import { CloseIcon, DownIcon, PlusIcon, UpIcon } from "../../shared/icons";
import { normalizeWebUrl } from "../../shared/url";
import { MAX_FAVORITES, MAX_FAVORITE_NAME } from "./limits";

interface Draft {
  key: string;
  name: string;
  url: string;
}

let draftCounter = 0;
const newKey = () => `draft-${++draftCounter}`;

const field =
  "w-full min-w-0 rounded-xl border border-hair bg-white/[0.04] px-3 py-2.5 text-base text-paper outline-none placeholder:text-paper/35 focus:border-accent";

/** Full-screen so nothing from the page shows through while editing. */
export function SettingsScreen() {
  const open = useApp((s) => s.sheet === "settings");
  const favorites = useApp((s) => s.state?.favorites);
  const serverError = useApp((s) => s.error);
  const closeSheet = useApp((s) => s.closeSheet);
  const saveFavorites = useApp((s) => s.saveFavorites);

  return open && favorites ? (
    <Editor
      initial={favorites.map((f) => ({ key: f.id, name: f.name, url: f.url }))}
      serverError={serverError}
      onCancel={closeSheet}
      onSave={async (drafts) => {
        const saved = await saveFavorites(drafts.map(({ name, url }) => ({ name, url })));
        if (saved) closeSheet();
      }}
    />
  ) : null;
}

interface EditorProps {
  initial: Draft[];
  serverError: string | null;
  onCancel: () => void;
  onSave: (drafts: Draft[]) => Promise<void>;
}

function Editor({ initial, serverError, onCancel, onSave }: EditorProps) {
  const [drafts, setDrafts] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const showGuide = useApp((s) => s.showGuide);

  const update = (key: string, patch: Partial<Draft>) => {
    setProblem(null);
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const move = (index: number, by: -1 | 1) =>
    setDrafts((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });

  const save = () => {
    const cleaned: Draft[] = [];
    for (const draft of drafts) {
      const url = normalizeWebUrl(draft.url);
      if (!draft.name.trim() || !url) {
        setProblem("Every favorite needs a name and a valid address.");
        return;
      }
      cleaned.push({ ...draft, url });
    }
    void onSave(cleaned);
  };

  return (
    <div data-hit="" className="fixed inset-0 z-50 flex flex-col bg-ink">
      <header className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
        <h1 className="text-xs font-medium tracking-[0.22em] text-paper/60 uppercase">Settings</h1>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onCancel}
          className="grid size-11 place-items-center rounded-full text-paper/80"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <h2 className="mt-2 text-3xl leading-tight font-semibold">Favorites</h2>
        <p className="mt-1 text-sm text-paper/55">
          Shown when you hold the button. Up to {MAX_FAVORITES}.
        </p>

        <ul className="mt-5 flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <li key={draft.key} className="flex items-stretch gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  aria-label={`Favorite ${index + 1} name`}
                  className={field}
                  maxLength={MAX_FAVORITE_NAME}
                  placeholder="Name"
                  value={draft.name}
                  onChange={(e) => update(draft.key, { name: e.target.value })}
                />
                <input
                  aria-label={`Favorite ${index + 1} address`}
                  className={field}
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="url"
                  placeholder="example.com"
                  value={draft.url}
                  onChange={(e) => update(draft.key, { url: e.target.value })}
                />
              </div>
              <div className="flex flex-col justify-between">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="grid size-9 place-items-center text-paper/70 disabled:opacity-20"
                >
                  <UpIcon />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${draft.name || "favorite"}`}
                  onClick={() => setDrafts((l) => l.filter((d) => d.key !== draft.key))}
                  className="grid size-9 place-items-center text-paper/70"
                >
                  <CloseIcon />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={index === drafts.length - 1}
                  onClick={() => move(index, 1)}
                  className="grid size-9 place-items-center text-paper/70 disabled:opacity-20"
                >
                  <DownIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          disabled={drafts.length >= MAX_FAVORITES}
          onClick={() => setDrafts((l) => [...l, { key: newKey(), name: "", url: "" }])}
          className="mt-4 flex items-center gap-2 text-sm font-medium text-accent disabled:opacity-30"
        >
          <PlusIcon /> Add favorite
        </button>

        <h2 className="mt-10 text-3xl leading-tight font-semibold">Assistant</h2>
        <p className="mt-1 text-sm text-paper/55">
          Not connected yet. Customizing sites with AI needs a provider key and the page engine,
          which come next.
        </p>

        <h2 className="mt-10 text-3xl leading-tight font-semibold">How it works</h2>
        <p className="mt-1 text-sm text-paper/55">Tap, hold, and drag: a short guide.</p>
        <button
          type="button"
          onClick={showGuide}
          className="mt-3 rounded-full border border-hair px-5 py-2.5 text-sm font-medium text-paper/85"
        >
          Replay the guide
        </button>
      </div>

      <footer className="border-t border-hair px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {(problem ?? serverError) && (
          <p className="mb-2 text-sm text-accent">{problem ?? serverError}</p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-hair py-3 text-base text-paper/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="flex-1 rounded-2xl bg-accent py-3 text-base font-semibold text-ink"
          >
            Save
          </button>
        </div>
      </footer>
    </div>
  );
}
