import { useState } from "react";
import { useApp } from "../../app/store";
import type { OptionGroup, SiteSettings } from "../../shared/ipc";
import { MarginSlider } from "./MarginSlider";
import { Switch } from "./Switch";

const GROUPS: { group: OptionGroup; title: string; note: string }[] = [
  { group: "annoyance", title: "Annoyances", note: "Hidden by default." },
  { group: "content", title: "Content", note: "Shown until you hide it." },
];

/** What each site can hide, with its own switches. The page reloads when one changes. */
export function SitesSection() {
  const sites = useApp((s) => s.sites);

  return (
    <section>
      <h2 className="text-3xl leading-tight font-semibold">Sites</h2>
      <p className="mt-1 text-sm text-paper/55">
        Switch on what you want hidden. Install prompts and pop-ups that block the page are hidden
        by default; Reels, Shorts and suggestions are shown until you hide them. The page reloads
        when you change a switch.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {sites.map((site) => (
          <SiteCard key={site.recipeId} site={site} />
        ))}
      </div>
    </section>
  );
}

function SiteCard({ site }: { site: SiteSettings }) {
  const [open, setOpen] = useState(false);
  const setSiteOption = useApp((s) => s.setSiteOption);
  const setSiteBottomMargin = useApp((s) => s.setSiteBottomMargin);
  const sharedMargin = useApp((s) => s.state?.bottomMargin ?? 0);
  const hidden = site.options.filter((option) => option.enabled).length;

  return (
    <div className="rounded-2xl border border-hair">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
      >
        <span className="text-lg font-medium">{site.name}</span>
        <span className="text-sm text-paper/55">
          {hidden} of {site.options.length} on
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-5 px-3 pb-4">
          {GROUPS.map(({ group, title, note }) => {
            const options = site.options.filter((option) => option.group === group);
            if (options.length === 0) return null;
            return (
              <div key={group} className="flex flex-col gap-2">
                <h3 className="px-1 text-xs font-medium tracking-[0.18em] text-paper/55 uppercase">
                  {title} <span className="tracking-normal normal-case">· {note}</span>
                </h3>
                {options.map((option) => (
                  <Switch
                    key={option.id}
                    label={option.label}
                    description={option.description}
                    checked={option.enabled}
                    onChange={(enabled) => void setSiteOption(site.recipeId, option.id, enabled)}
                  />
                ))}
              </div>
            );
          })}
          <div className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-medium tracking-[0.18em] text-paper/55 uppercase">
              Bottom margin
            </h3>
            <div className="flex flex-col gap-3 rounded-2xl border border-hair px-4 py-3">
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
                  className="self-start text-sm font-medium text-accent"
                >
                  Use the shared margin
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
