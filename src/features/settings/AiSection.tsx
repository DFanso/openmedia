import { useCallback, useEffect, useState } from "react";
import { ai, errorMessage, type AiState, type Provider, type ProviderKind } from "../../shared/ipc";
import { PRESETS } from "./presets";

const field =
  "w-full min-w-0 rounded-xl border border-hair bg-paper/[0.05] px-3 py-2.5 text-base text-paper outline-none placeholder:text-paper/35 focus:border-accent";
const quiet = "rounded-full border border-hair px-4 py-2 text-sm font-medium text-paper/85";

interface Draft {
  id?: string;
  presetId: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

const blankDraft = (): Draft => ({
  presetId: PRESETS[0].id,
  name: PRESETS[0].label,
  kind: PRESETS[0].kind,
  baseUrl: PRESETS[0].baseUrl,
  model: "",
  hasKey: false,
});

const draftOf = (p: Provider): Draft => ({
  id: p.id,
  presetId: PRESETS.find((x) => x.baseUrl === p.baseUrl)?.id ?? "custom",
  name: p.name,
  kind: p.kind,
  baseUrl: p.baseUrl,
  model: p.model ?? "",
  hasKey: p.hasKey,
});

/** Bring-your-own-key providers. Keys go to Rust and the Keychain and never come back. */
export function AiSection() {
  const [state, setState] = useState<AiState | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setState(await ai.state());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    ai.state().then(
      (loaded) => !cancelled && setState(loaded),
      (e: unknown) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const makeActive = async (id: string) => {
    await ai.setActive(id).catch((e: unknown) => setError(errorMessage(e)));
    await reload();
  };

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">AI assistant</h2>
      <p className="mt-1 text-sm text-paper/55">
        Bring your own key. It is stored in the iOS Keychain, read only by the app&apos;s Rust core,
        and sent only to the provider you choose. The assistant itself is not connected yet; saved
        providers are used once it ships.
      </p>
      <div className="mt-3 rounded-2xl border border-hair p-3 text-sm text-paper/70">
        <div className="font-medium text-paper">Where to get a key</div>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
          <li>
            <span className="text-paper">OpenRouter (openrouter.ai)</span>: free variants and paid
            models from many vendors. Models listed with :free have no model charge, subject to rate
            limits and availability.
          </li>
          <li>
            <span className="text-paper">OpenCode Zen / Console (opencode.ai/console)</span>:
            curated models, paid by usage. Its free-tier chat models require OpenCode itself, not
            OpenMedia.
          </li>
          <li>
            <span className="text-paper">Ollama (ollama.com) or LM Studio (lmstudio.ai)</span>:
            local models with no model API fees; requires suitable hardware. Pick Custom and enter
            your server&apos;s address, reachable from this device.
          </li>
        </ul>
        <p className="mt-1.5 text-xs text-paper/50">
          Check current pricing, usage limits and data policies. Model lists do not guarantee free
          access or structured output support.
        </p>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {state?.providers.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-hair p-3">
            <button
              type="button"
              aria-label={`Use ${p.name}`}
              aria-pressed={state.activeId === p.id}
              onClick={() => void makeActive(p.id)}
              className={`grid size-5 shrink-0 place-items-center rounded-full border ${
                state.activeId === p.id ? "border-accent" : "border-paper/30"
              }`}
            >
              {state.activeId === p.id && <span className="size-2.5 rounded-full bg-accent" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="truncate text-xs text-paper/50">
                {p.hasKey ? "Key saved" : "No key"}
                {p.model ? ` · ${p.model}` : ""}
              </div>
            </div>
            <button type="button" className={quiet} onClick={() => setDraft(draftOf(p))}>
              Edit
            </button>
          </li>
        ))}
      </ul>

      {draft ? (
        <ProviderForm
          key={draft.id ?? "new"}
          initial={draft}
          onClose={() => setDraft(null)}
          onChanged={reload}
        />
      ) : (
        <button
          type="button"
          onClick={() => setDraft(blankDraft())}
          className="mt-3 text-sm font-medium text-accent"
        >
          + Add provider
        </button>
      )}
      {error && !draft && <p className="mt-2 text-sm text-accent">{error}</p>}
    </section>
  );
}

interface FormProps {
  initial: Draft;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

function ProviderForm({ initial, onClose, onChanged }: FormProps) {
  const [draft, setDraft] = useState(initial);
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [replacing, setReplacing] = useState(!initial.hasKey);
  const [models, setModels] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = (change: Partial<Draft>) => {
    setNote(null);
    setDraft((d) => ({ ...d, ...change }));
  };

  const choosePreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset)
      patch({ presetId: id, name: preset.label, kind: preset.kind, baseUrl: preset.baseUrl });
  };

  /** Saves the settings, then the key if one was typed; returns the provider id. */
  const persist = async (): Promise<string> => {
    const saved = await ai.saveProvider({
      id: draft.id,
      name: draft.name,
      kind: draft.kind,
      baseUrl: draft.baseUrl,
      model: draft.model || null,
    });
    if (key) {
      await ai.setKey(saved.id, key);
      setKey("");
      setReplacing(false);
      setDraft((d) => ({ ...d, id: saved.id, hasKey: true }));
    } else {
      setDraft((d) => ({ ...d, id: saved.id }));
    }
    await onChanged();
    return saved.id;
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const test = () =>
    run(async () => {
      const id = await persist();
      const found = await ai.test(id);
      setModels(found);
      setNote(`Connected. ${found.length} model${found.length === 1 ? "" : "s"} available.`);
    });

  const save = () =>
    run(async () => {
      await persist();
      onClose();
    });

  const remove = () =>
    run(async () => {
      if (!draft.id) return;
      await ai.deleteProvider(draft.id);
      await onChanged();
      onClose();
    });

  const removeKey = () =>
    run(async () => {
      if (!draft.id) return;
      await ai.removeKey(draft.id);
      setDraft((d) => ({ ...d, hasKey: false }));
      setReplacing(true);
      await onChanged();
    });

  const preset = PRESETS.find((p) => p.id === draft.presetId);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-hair p-4">
      {!initial.id && (
        <select
          aria-label="Provider"
          className={field}
          value={draft.presetId}
          onChange={(e) => choosePreset(e.target.value)}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      <input
        aria-label="Provider name"
        className={field}
        placeholder="Name"
        maxLength={30}
        value={draft.name}
        onChange={(e) => patch({ name: e.target.value })}
      />
      <input
        aria-label="Base URL"
        className={field}
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="url"
        placeholder={preset?.placeholder ?? "https://…"}
        value={draft.baseUrl}
        onChange={(e) => patch({ baseUrl: e.target.value })}
      />

      {replacing ? (
        <div className="flex items-center gap-2">
          <input
            aria-label="API key"
            className={field}
            type={showKey ? "text" : "password"}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="API key"
            value={key}
            onChange={(e) => {
              setNote(null);
              setKey(e.target.value);
            }}
          />
          <button type="button" className={quiet} onClick={() => setShowKey((v) => !v)}>
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm text-paper/70">
          <span>A key is saved in the Keychain.</span>
          <span className="flex gap-2">
            <button type="button" className={quiet} onClick={() => setReplacing(true)}>
              Replace
            </button>
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => void removeKey()}
            >
              Remove
            </button>
          </span>
        </div>
      )}

      {models.length > 0 ? (
        <select
          aria-label="Model"
          className={field}
          value={draft.model}
          onChange={(e) => patch({ model: e.target.value })}
        >
          <option value="">Choose a model</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label="Model"
          className={field}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder="Model (test the connection to list them)"
          value={draft.model}
          onChange={(e) => patch({ model: e.target.value })}
        />
      )}

      {note && <p className="text-sm text-accent">{note}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={quiet} disabled={busy} onClick={() => void test()}>
          Test connection
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent"
        >
          Save
        </button>
        <button type="button" className={quiet} onClick={onClose}>
          Cancel
        </button>
        {draft.id && (
          <button
            type="button"
            className={`${quiet} ml-auto text-red-400`}
            disabled={busy}
            onClick={() => void remove()}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
