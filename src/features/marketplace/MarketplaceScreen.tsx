import { useCallback, useEffect, useRef, useState } from "react";
import { library } from "../../shared/ipc";
import { registrableDomain } from "../../shared/site";
import { useApp } from "../../app/store";
import { describeError } from "../../i18n/errors";
import type { MessageKey } from "../../i18n/messages";
import { useT } from "../../i18n/useT";
import { SiteTile } from "../../shared/SiteTile";
import { faviconPageUrlForHost, useIconForUrl, setIconCache } from "../../shared/siteIcons";
import { Screen } from "../../shared/Screen";
import { Switch } from "../settings/Switch";
import { Group, field, primaryButton, quietButton } from "../settings/ui";
import {
  marketplace,
  type MarketItem,
  type MarketListing,
  type RecipePreview,
  type ReportReason,
} from "./ipc";
import { RecipeReview } from "./RecipeReview";

type View = { kind: "list" } | { kind: "detail"; item: MarketItem } | { kind: "submit" };

const REASONS: { reason: ReportReason; label: MessageKey }[] = [
  { reason: "harmful", label: "market.report.harmful" },
  { reason: "broken", label: "market.report.broken" },
  { reason: "misleading", label: "market.report.misleading" },
  { reason: "spam", label: "market.report.spam" },
  { reason: "other", label: "market.report.other" },
];

const iconRequests = new Map<string, Promise<void>>();

function fetchMarketplaceIcon(url: string): void {
  const host = new URL(url).hostname;
  const key = registrableDomain(host);
  if (iconRequests.has(key)) return;
  const request = library
    .refreshIcons([url])
    .then(setIconCache)
    .catch(() => {})
    .finally(() => iconRequests.delete(key));
  iconRequests.set(key, request);
}

/** Recipes other people made, checked automatically and listed after the hold period. Opened from Settings. */
export function MarketplaceScreen() {
  const open = useApp((s) => s.sheet === "marketplace");
  return open ? <MarketplaceBody /> : null;
}

function MarketplaceBody() {
  const closeSheet = useApp((s) => s.closeSheet);
  const loadSites = useApp((s) => s.loadSites);
  const t = useT();
  const [view, setView] = useState<View>({ kind: "list" });
  const [listing, setListing] = useState<MarketListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      marketplace
        .list()
        .then((next) => {
          setError(null);
          setListing(next);
          if (next.withdrawn.length > 0) void loadSites();
        })
        .catch((failure: unknown) => setError(describeError(failure, t))),
    [loadSites, t],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const back = () => (view.kind === "list" ? closeSheet() : setView({ kind: "list" }));

  return (
    <Screen title={t("market.title")} closeLabel={t("common.back")} onClose={back} back>
      {view.kind === "list" && (
        <ListView
          listing={listing}
          error={error}
          onRetry={() => {
            setError(null);
            void refresh();
          }}
          onOpen={(item) => setView({ kind: "detail", item })}
          onShare={() => setView({ kind: "submit" })}
        />
      )}
      {view.kind === "detail" && (
        <DetailView
          item={view.item}
          onChanged={async () => {
            await refresh();
            setView({ kind: "list" });
          }}
        />
      )}
      {view.kind === "submit" && <SubmitView />}
    </Screen>
  );
}

interface ListViewProps {
  listing: MarketListing | null;
  error: string | null;
  onRetry: () => void;
  onOpen: (item: MarketItem) => void;
  onShare: () => void;
}

function ListView({ listing, error, onRetry, onOpen, onShare }: ListViewProps) {
  const t = useT();

  return (
    <div className="flex flex-col gap-5">
      <p className="px-1 text-[13px] leading-snug text-paper/50">{t("market.note")}</p>
      {error && (
        <div className="flex flex-col items-start gap-3 px-1">
          <p className="text-sm text-paper/70">{error}</p>
          <button type="button" onClick={onRetry} className={quietButton}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {!error && listing === null && (
        <p className="px-1 text-sm text-paper/55">{t("market.loading")}</p>
      )}
      {listing && listing.withdrawn.length > 0 && (
        <p className="px-1 text-sm text-paper/70">
          {t("market.withdrawn", { names: listing.withdrawn.join(", ") })}
        </p>
      )}
      {listing && listing.items.length === 0 && (
        <p className="px-1 text-sm text-paper/55">{t("market.empty")}</p>
      )}
      {listing && listing.items.length > 0 && (
        <Group>
          {listing.items.map((item) => (
            <ItemRow key={item.id} item={item} onOpen={() => onOpen(item)} />
          ))}
        </Group>
      )}
      <div className="flex flex-col gap-3">
        <button type="button" onClick={onShare} className={`self-start ${quietButton}`}>
          {t("market.share")}
        </button>
        <CountingSwitch />
      </div>
    </div>
  );
}

function ItemRow({ item, onOpen }: { item: MarketItem; onOpen: () => void }) {
  const t = useT();
  const iconUrl = item.hosts.map(faviconPageUrlForHost).find(Boolean);
  const icon = useIconForUrl(iconUrl ?? "", []);
  const row = useRef<HTMLButtonElement>(null);
  const state = item.installedVersion
    ? t(item.updateAvailable ? "market.update" : "market.added")
    : null;

  useEffect(() => {
    const element = row.current;
    if (!element || !iconUrl || icon) return;
    const load = () => fetchMarketplaceIcon(iconUrl);
    if (typeof IntersectionObserver === "undefined") {
      load();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [icon, iconUrl]);

  return (
    <button
      ref={row}
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-start active:bg-paper/[0.05]"
    >
      <SiteTile name={item.name} icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{item.name}</span>
        <span className="block truncate text-sm text-paper/55">
          {t("market.by", { author: item.author })}
          {item.installs ? ` · ${t("market.addedBy", { count: item.installs })}` : ""}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-paper/55">{item.summary}</span>
      </span>
      {state && <span className="shrink-0 text-sm text-accent">{state}</span>}
    </button>
  );
}

function CountingSwitch() {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    void marketplace.status().then((status) => setEnabled(status.countInstalls));
  }, []);

  if (enabled === null) return null;
  return (
    <Group>
      <Switch
        label={t("market.counting")}
        description={t("market.countingNote")}
        checked={enabled}
        onChange={(next) => {
          setEnabled(next);
          void marketplace.setCounting(next);
        }}
      />
    </Group>
  );
}

function DetailView({ item, onChanged }: { item: MarketItem; onChanged: () => Promise<void> }) {
  const loadSites = useApp((s) => s.loadSites);
  const t = useT();
  const [preview, setPreview] = useState<RecipePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    let current = true;
    marketplace
      .preview(item.id)
      .then((next) => current && setPreview(next))
      .catch((failure: unknown) => current && setError(describeError(failure, t)));
    return () => {
      current = false;
    };
  }, [item.id, t]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadSites();
      await onChanged();
    } catch (failure) {
      setError(describeError(failure, t));
      setBusy(false);
    }
  };

  const report = async (reason: ReportReason) => {
    setError(null);
    try {
      await marketplace.report(item.id, reason);
      setReported(true);
    } catch (failure) {
      setError(describeError(failure, t));
    }
  };

  const canAdd = !item.installedVersion || item.updateAvailable;

  return (
    <div className="flex flex-col gap-5">
      <div className="px-1">
        <h2 className="text-xl font-semibold">{item.name}</h2>
        <p className="mt-1 text-sm leading-snug text-paper/70">{item.summary}</p>
      </div>
      {preview && <RecipeReview preview={preview} />}
      {error && <p className="px-1 text-sm text-paper/70">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {canAdd && (
          <button
            type="button"
            disabled={!preview || busy}
            onClick={() => void run(() => marketplace.install(item.id))}
            className={primaryButton}
          >
            {t(item.installedVersion ? "market.update" : "market.add")}
          </button>
        )}
        {item.installedVersion && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => marketplace.uninstall(item.id))}
            className={quietButton}
          >
            {t("common.remove")}
          </button>
        )}
      </div>
      <div>
        <p className="px-1 pb-2 text-[13px] font-medium text-paper/60">{t("market.report")}</p>
        {reported ? (
          <p className="px-1 text-sm text-paper/70">{t("market.reported")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {REASONS.map(({ reason, label }) => (
              <button
                key={reason}
                type="button"
                onClick={() => void report(reason)}
                className={quietButton}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const slugOf = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Sends one of the user's own recipes to the marketplace. Only their own are offered. */
function SubmitView() {
  const sites = useApp((s) => s.sites);
  const own = sites.filter((site) => site.origin === "user" || site.origin === "ai");
  const t = useT();
  const [recipeId, setRecipeId] = useState(own[0]?.recipeId ?? "");
  const [slug, setSlug] = useState(slugOf(own[0]?.name ?? ""));
  const [summary, setSummary] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (own.length === 0) {
    return <p className="px-1 text-sm text-paper/55">{t("share.none")}</p>;
  }

  const pick = (id: string) => {
    setRecipeId(id);
    setSlug(slugOf(own.find((site) => site.recipeId === id)?.name ?? ""));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await marketplace.submit(recipeId, slug, summary, author);
      setSent(true);
    } catch (failure) {
      setError(describeError(failure, t));
    } finally {
      setBusy(false);
    }
  };

  if (sent) return <p className="px-1 text-sm text-paper/70">{t("market.share.sent")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[13px] leading-snug text-paper/50">{t("market.share.note")}</p>
      <label className="flex flex-col gap-1.5 text-sm text-paper/70">
        {t("market.share.recipe")}
        <select value={recipeId} onChange={(event) => pick(event.target.value)} className={field}>
          {own.map((site) => (
            <option key={site.recipeId} value={site.recipeId}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-paper/70">
        {t("market.share.name")}
        <input
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          maxLength={61}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-paper/70">
        {t("market.share.summary")}
        <input
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={140}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm text-paper/70">
        {t("market.share.author")}
        <input
          value={author}
          onChange={(event) => setAuthor(event.target.value)}
          maxLength={60}
          className={field}
        />
      </label>
      {error && <p className="px-1 text-sm text-paper/70">{error}</p>}
      <button
        type="button"
        disabled={busy || !slug || !summary.trim() || !author.trim()}
        onClick={() => void send()}
        className={`self-start ${primaryButton}`}
      >
        {t("market.share.send")}
      </button>
    </div>
  );
}
