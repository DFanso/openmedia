import { useState } from "react";
import { useApp } from "../../app/store";
import { useIconForUrl } from "../../shared/siteIcons";
import { DownIcon, StarIcon } from "../../shared/icons";
import type { OptionGroup, SiteSettings } from "../../shared/ipc";
import { SiteTile } from "../../shared/SiteTile";
import { MarginSlider } from "./MarginSlider";
import { Switch } from "./Switch";
import { Group, GroupLabel, Section, quietButton } from "./ui";

const GROUPS: { group: OptionGroup; title: string }[] = [
  { group: "annoyance", title: "Annoyances · hidden by default" },
  { group: "content", title: "Content · shown until you hide it" },
];

/** Ready-made tweaks for popular sites. The page reloads when a switch changes. */
export function PremadeRecipesSection() {
  const sites = useApp((s) => s.sites);

  return (
    <Section
      title="Pre-made recipes"
      note="Ready-made recipes for popular sites. Install prompts and pop-ups that block the page are hidden by default; Reels, Shorts and suggestions are shown until you hide them. The page reloads when you change a switch. Star a recipe to add its site to your favorites."
    >
      <div className="flex flex-col gap-3">
        {sites.map((site) => (
          <SiteCard key={site.recipeId} site={site} />
        ))}
      </div>
    </Section>
  );
}

function SiteCard({ site }: { site: SiteSettings }) {
  const [open, setOpen] = useState(false);
  const favorites = useApp((s) => s.state?.favorites);
  const setSiteFavorite = useApp((s) => s.setSiteFavorite);
  const icon = useIconForUrl(site.homepage ?? "", favorites ?? []);
  const hidden = site.options.filter((option) => option.enabled).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${site.name} options`}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2 pl-4 text-left active:bg-paper/[0.05]"
        >
          <SiteTile name={site.name} icon={icon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{site.name}</span>
            <span className="block text-sm text-paper/55">
              {hidden === 0 ? "Nothing hidden" : `${hidden} of ${site.options.length} hidden`}
            </span>
          </span>
          <span
            className={`text-paper/50 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <DownIcon />
          </span>
        </button>
        {site.homepage && (
          <button
            type="button"
            aria-pressed={site.favorite}
            aria-label={
              site.favorite ? `Remove ${site.name} from favorites` : `Add ${site.name} to favorites`
            }
            onClick={() => void setSiteFavorite(site.recipeId, !site.favorite)}
            className={`grid size-12 shrink-0 place-items-center active:bg-paper/[0.05] ${
              site.favorite ? "text-accent" : "text-paper/55"
            }`}
          >
            <StarIcon filled={site.favorite} />
          </button>
        )}
      </div>
      {open && <SiteOptions site={site} />}
    </div>
  );
}

function SiteOptions({ site }: { site: SiteSettings }) {
  const setSiteOption = useApp((s) => s.setSiteOption);
  const setSiteBottomMargin = useApp((s) => s.setSiteBottomMargin);
  const sharedMargin = useApp((s) => s.state?.bottomMargin ?? 0);
  const restoreRecipeOriginal = useApp((s) => s.restoreRecipeOriginal);

  return (
    <div className="flex flex-col gap-5 border-t border-hair px-3 py-4">
      {site.customized && (
        <div className="flex flex-col gap-2 rounded-2xl border border-hair px-4 py-3">
          <p className="text-sm leading-snug text-paper/55">
            This recipe is your changed copy, so app updates leave it alone.
            {site.originalUpdated && " The app's original has been updated since you changed it."}
          </p>
          <button
            type="button"
            onClick={() => void restoreRecipeOriginal(site.recipeId)}
            className="self-start text-sm font-medium text-accent"
          >
            Restore the original
          </button>
        </div>
      )}
      {GROUPS.map(({ group, title }) => {
        const options = site.options.filter((option) => option.group === group);
        if (options.length === 0) return null;
        return (
          <div key={group}>
            <GroupLabel>{title}</GroupLabel>
            <Group>
              {options.map((option) => (
                <Switch
                  key={option.id}
                  label={option.label}
                  description={option.description}
                  checked={option.enabled}
                  onChange={(enabled) => void setSiteOption(site.recipeId, option.id, enabled)}
                />
              ))}
            </Group>
          </div>
        );
      })}
      <div>
        <GroupLabel>Bottom margin</GroupLabel>
        <Group>
          <div className="flex flex-col gap-3 px-4 py-3.5">
            <p className="text-sm leading-snug text-paper/55">
              {site.bottomMargin === null
                ? "Uses the shared margin. Move the slider to give this site its own."
                : "This site has its own margin."}
            </p>
            <MarginSlider
              label={`${site.name} bottom margin`}
              value={site.bottomMargin ?? sharedMargin}
              onCommit={(pixels) => void setSiteBottomMargin(site.recipeId, pixels)}
            />
            {site.bottomMargin !== null && (
              <button
                type="button"
                onClick={() => void setSiteBottomMargin(site.recipeId, null)}
                className={`self-start ${quietButton}`}
              >
                Use the shared margin
              </button>
            )}
          </div>
        </Group>
      </div>
    </div>
  );
}
