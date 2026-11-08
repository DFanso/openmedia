import { useState } from "react";
import { useApp } from "../../app/store";
import type { MessageKey } from "../../i18n/messages";
import { useT } from "../../i18n/useT";
import { useIconForUrl } from "../../shared/siteIcons";
import { DownIcon, StarIcon } from "../../shared/icons";
import type { OptionGroup, SiteSettings } from "../../shared/ipc";
import { SiteTile } from "../../shared/SiteTile";
import { MarginSlider } from "./MarginSlider";
import { Switch } from "./Switch";
import { Group, GroupLabel, Section, quietButton } from "./ui";

const GROUPS: { group: OptionGroup; title: MessageKey }[] = [
  { group: "annoyance", title: "recipes.annoyances" },
  { group: "content", title: "recipes.content" },
];

/** Ready-made tweaks for popular sites. The page reloads when a switch changes. */
export function RecipesSection() {
  const sites = useApp((s) => s.sites);
  const t = useT();

  return (
    <Section title={t("recipes.title")} defaultOpen={false} note={t("recipes.note")}>
      <div className="flex flex-col gap-3">
        {sites.map((site) => (
          <SiteCard key={site.recipeId} site={site} />
        ))}
      </div>
    </Section>
  );
}

/** One recipe's card. In incognito mode it edits the incognito choices and has no star or margin. */
export function SiteCard({ site, incognito = false }: { site: SiteSettings; incognito?: boolean }) {
  const [open, setOpen] = useState(false);
  const favorites = useApp((s) => s.state?.favorites);
  const setSiteFavorite = useApp((s) => s.setSiteFavorite);
  const icon = useIconForUrl(site.homepage ?? "", favorites ?? []);
  const hidden = site.options.filter((option) => option.enabled).length;
  const t = useT();

  return (
    <div className="overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("recipes.options", { name: site.name })}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pe-2 ps-4 text-start active:bg-paper/[0.05]"
        >
          <SiteTile name={site.name} icon={icon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{site.name}</span>
            <span className="block text-sm text-paper/55">
              {hidden === 0
                ? t("recipes.nothingHidden")
                : t("recipes.hiddenCount", { count: hidden, total: site.options.length })}
            </span>
          </span>
          <span
            className={`text-paper/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <DownIcon />
          </span>
        </button>
        {!incognito && site.homepage && (
          <button
            type="button"
            aria-pressed={site.favorite}
            aria-label={t(site.favorite ? "recipes.removeFavorite" : "recipes.addFavorite", {
              name: site.name,
            })}
            onClick={() => void setSiteFavorite(site.recipeId, !site.favorite)}
            className={`grid size-12 shrink-0 place-items-center active:bg-paper/[0.05] ${
              site.favorite ? "text-accent" : "text-paper/55"
            }`}
          >
            <StarIcon filled={site.favorite} />
          </button>
        )}
      </div>
      {open && (incognito ? <IncognitoSiteOptions site={site} /> : <SiteOptions site={site} />)}
    </div>
  );
}

function SiteOptions({ site }: { site: SiteSettings }) {
  const setSiteOption = useApp((s) => s.setSiteOption);
  const setSiteBottomMargin = useApp((s) => s.setSiteBottomMargin);
  const sharedMargin = useApp((s) => s.state?.bottomMargin ?? 0);
  const restoreRecipeOriginal = useApp((s) => s.restoreRecipeOriginal);
  const t = useT();

  return (
    <div className="flex flex-col gap-5 border-t border-hair px-3 py-4">
      {site.customized && (
        <div className="flex flex-col gap-2 rounded-2xl border border-hair px-4 py-3">
          <p className="text-sm leading-snug text-paper/55">
            {t("recipes.customized")}
            {site.originalUpdated && ` ${t("recipes.originalUpdated")}`}
          </p>
          <button
            type="button"
            onClick={() => void restoreRecipeOriginal(site.recipeId)}
            className="self-start text-sm font-medium text-accent"
          >
            {t("recipes.restore")}
          </button>
        </div>
      )}
      <OptionGroups
        site={site}
        onToggle={(optionId, enabled) => void setSiteOption(site.recipeId, optionId, enabled)}
      />
      <div>
        <GroupLabel>{t("recipes.bottomMargin")}</GroupLabel>
        <Group>
          <div className="flex flex-col gap-3 px-4 py-3.5">
            <p className="text-sm leading-snug text-paper/55">
              {site.bottomMargin === null ? t("recipes.sharedMargin") : t("recipes.ownMargin")}
            </p>
            <MarginSlider
              label={t("recipes.siteMarginLabel", { name: site.name })}
              value={site.bottomMargin ?? sharedMargin}
              onCommit={(pixels) => void setSiteBottomMargin(site.recipeId, pixels)}
            />
            {site.bottomMargin !== null && (
              <button
                type="button"
                onClick={() => void setSiteBottomMargin(site.recipeId, null)}
                className={`self-start ${quietButton}`}
              >
                {t("recipes.useSharedMargin")}
              </button>
            )}
          </div>
        </Group>
      </div>
    </div>
  );
}

function IncognitoSiteOptions({ site }: { site: SiteSettings }) {
  const setIncognitoSiteOption = useApp((s) => s.setIncognitoSiteOption);

  return (
    <div className="flex flex-col gap-5 border-t border-hair px-3 py-4">
      <OptionGroups
        site={site}
        onToggle={(optionId, enabled) =>
          void setIncognitoSiteOption(site.recipeId, optionId, enabled)
        }
      />
    </div>
  );
}

/** The site's switches, annoyances first and then content. */
function OptionGroups({
  site,
  onToggle,
}: {
  site: SiteSettings;
  onToggle: (optionId: string, enabled: boolean) => void;
}) {
  const t = useT();

  return GROUPS.map(({ group, title }) => {
    const options = site.options.filter((option) => option.group === group);
    if (options.length === 0) return null;
    return (
      <div key={group}>
        <GroupLabel>{t(title)}</GroupLabel>
        <Group>
          {options.map((option) => (
            <Switch
              key={option.id}
              label={option.label}
              description={option.description}
              checked={option.enabled}
              onChange={(enabled) => onToggle(option.id, enabled)}
            />
          ))}
        </Group>
      </div>
    );
  });
}
