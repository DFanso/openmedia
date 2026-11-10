import { useT } from "../../i18n/useT";
import type { Proposal } from "./ipc";

/** The switch an answer would add or turn on, with the rules it hides and what each matched. */
export function ProposalDetails({ proposal }: { proposal: Proposal }) {
  const t = useT();
  return (
    <div className="rounded-xl border border-hair bg-paper/[0.05] px-3 py-2.5">
      {proposal.kind === "existingOption" && (
        <p className="text-xs font-medium text-accent">{t("assistant.switchExists")}</p>
      )}
      <p className="text-sm font-medium text-paper">{proposal.option.label}</p>
      {proposal.option.description && (
        <p className="text-xs leading-snug text-paper/60">{proposal.option.description}</p>
      )}
      <p className="mt-1 text-[11px] tracking-wide text-paper/45 uppercase">
        {proposal.option.group === "annoyance"
          ? t("recipes.groupAnnoyance")
          : t("recipes.groupContent")}{" "}
        · {proposal.recipeName}
      </p>
      {proposal.rules.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-hair pt-2">
          {proposal.rules.map((rule, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-paper/80">{rule.label}</span>
              <span className={`shrink-0 ${rule.matches > 0 ? "text-paper/55" : "text-accent"}`}>
                {t("assistant.matched", { count: Math.max(rule.matches, 0) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
