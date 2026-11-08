import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../app/store";
import { describeError } from "../../i18n/errors";
import { useT } from "../../i18n/useT";
import { normalizeWebUrl } from "../../shared/url";
import { siteOf } from "../../shared/site";
import { usagePolicies, type UsagePolicy, type UsagePolicies } from "./policy";

const EMPTY_POLICY: UsagePolicy = { warnSeconds: null, limitSeconds: null };
const EMPTY_SITES: { favorites: { url: string }[]; history: string[] } = {
  favorites: [],
  history: [],
};

function hostFor(value: string): string | null {
  const normalized = normalizeWebUrl(value);
  if (!normalized) return null;
  return siteOf(normalized);
}

export function UsagePoliciesForm() {
  const state = useApp((s) => s.state) ?? EMPTY_SITES;
  const reportError = useApp((s) => s.reportError);
  const [policies, setPolicies] = useState<UsagePolicies>({});
  const [site, setSite] = useState("");
  const [warning, setWarning] = useState("");
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const t = useT();
  const suggestions = useMemo(() => {
    const hosts = new Set<string>();
    for (const favorite of state.favorites) {
      const host = hostFor(favorite.url);
      if (host) hosts.add(host);
    }
    for (const address of state.history) {
      const host = hostFor(address);
      if (host) hosts.add(host);
    }
    return [...hosts];
  }, [state.favorites, state.history]);

  useEffect(() => {
    let active = true;
    void usagePolicies
      .get()
      .then((loaded) => {
        if (active) setPolicies(loaded);
      })
      .catch((cause: unknown) => {
        if (active) reportError(describeError(cause, t));
      });
    return () => {
      active = false;
    };
  }, [reportError, t]);

  const clearForm = () => {
    setSite("");
    setWarning("");
    setLimit("");
    setError("");
  };

  const save = async () => {
    setError("");
    const host = hostFor(site);
    if (!host) {
      setError(t("usage.invalidAddress"));
      return;
    }
    const parseMinutes = (value: string): number | null | undefined => {
      if (value === "") return null;
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440 ? parsed * 60 : undefined;
    };
    const warnSeconds = parseMinutes(warning);
    const limitSeconds = parseMinutes(limit);
    if (warnSeconds === undefined || limitSeconds === undefined) {
      setError(t("usage.invalidMinutes"));
      return;
    }
    if (warnSeconds === null && limitSeconds === null) {
      setError(t("usage.needsOne"));
      return;
    }
    if (warnSeconds !== null && limitSeconds !== null && warnSeconds >= limitSeconds) {
      setError(t("usage.warningTooLate"));
      return;
    }
    setPending(true);
    try {
      const updated = await usagePolicies.set(host, { warnSeconds, limitSeconds });
      setPolicies(updated);
      clearForm();
    } catch (cause) {
      setError(describeError(cause, t));
    } finally {
      setPending(false);
    }
  };

  const remove = async (host: string) => {
    setError("");
    setPending(true);
    try {
      setPolicies(await usagePolicies.set(host, EMPTY_POLICY));
    } catch (cause) {
      setError(describeError(cause, t));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-hair p-4">
      <h2 className="text-sm font-semibold">{t("usage.title")}</h2>
      <p className="mt-1 text-sm leading-relaxed text-paper/60">{t("usage.note")}</p>
      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-paper/60">
          {t("usage.siteAddress")}
          <input
            aria-label={t("usage.siteAddress")}
            list="usage-policy-sites"
            type="text"
            value={site}
            disabled={pending}
            onChange={(event) => setSite(event.target.value)}
            placeholder="example.com"
            className="rounded-xl border border-hair bg-transparent px-3 py-2 text-sm text-paper"
          />
        </label>
        <datalist id="usage-policy-sites">
          {suggestions.map((host) => (
            <option key={host} value={host} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-paper/60">
            {t("usage.warningMinutes")}
            <input
              aria-label={t("usage.warningMinutes")}
              type="number"
              min={1}
              max={1440}
              step={1}
              value={warning}
              disabled={pending}
              onChange={(event) => setWarning(event.target.value)}
              className="rounded-xl border border-hair bg-transparent px-3 py-2 text-sm text-paper"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-paper/60">
            {t("usage.limitMinutes")}
            <input
              aria-label={t("usage.limitMinutes")}
              type="number"
              min={1}
              max={1440}
              step={1}
              value={limit}
              disabled={pending}
              onChange={(event) => setLimit(event.target.value)}
              className="rounded-xl border border-hair bg-transparent px-3 py-2 text-sm text-paper"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="self-start rounded-full border border-accent px-4 py-2 text-sm text-accent disabled:opacity-50"
        >
          {t("common.save")}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
      </div>
      {Object.keys(policies).length === 0 ? (
        <p className="mt-4 text-sm text-paper/50">{t("usage.none")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-hair">
          {Object.entries(policies).map(([host, policy]) => (
            <li key={host} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{host}</p>
                <p className="text-xs text-paper/55">
                  {[
                    policy.warnSeconds !== null
                      ? t("usage.warnAt", {
                          value: t("usage.minutes", { value: policy.warnSeconds / 60 }),
                        })
                      : null,
                    policy.limitSeconds !== null
                      ? t("usage.limitAt", {
                          value: t("usage.minutes", { value: policy.limitSeconds / 60 }),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setSite(host);
                    setWarning(policy.warnSeconds === null ? "" : String(policy.warnSeconds / 60));
                    setLimit(policy.limitSeconds === null ? "" : String(policy.limitSeconds / 60));
                  }}
                  className="rounded-full px-3 py-2 text-sm text-paper/70 disabled:opacity-50"
                >
                  {t("common.edit")}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void remove(host)}
                  className="rounded-full px-3 py-2 text-sm text-paper/70 disabled:opacity-50"
                >
                  {t("common.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
