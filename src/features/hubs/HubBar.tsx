import { useMemo } from "react";
import { selectPage, useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import { activeHub } from "../../shared/hubs";

/**
 * The pages of the hub the visible page belongs to. Every page is a site of its own, so
 * switching between them switches sessions: each keeps its own cookies and its own recipe.
 */
export function HubBar() {
  const page = useApp(selectPage);
  const sites = useApp((s) => s.sites);
  const openHubTab = useApp((s) => s.openHubTab);
  const t = useT();
  const url = page?.url ?? page?.openedUrl ?? null;
  const hubId = page?.source === "hub" ? page.hubId : null;
  const hub = useMemo(() => activeHub(sites, hubId, url), [sites, hubId, url]);

  if (!hub) return null;

  return (
    <div
      data-hit=""
      role="group"
      aria-label={t("hub.pages", { name: hub.name })}
      className="pointer-events-auto flex flex-none items-center overflow-x-auto border-b border-hair bg-ink px-2 py-1.5"
    >
      <div className="mx-auto flex w-max min-w-full items-center justify-center gap-1">
        {hub.tabs.map((tab, index) => (
          <button
            key={tab.url}
            type="button"
            aria-current={index === hub.active ? "page" : undefined}
            onClick={() => openHubTab(tab.url, hub.recipeId)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              index === hub.active ? "bg-accent text-on-accent" : "bg-paper/[0.06] text-paper/75"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
