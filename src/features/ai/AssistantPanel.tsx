import type { ReactNode } from "react";
import { useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import type { AssistantState } from "./flow";
import type { Proposal } from "./ipc";

const primary =
  "rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40";
const quiet =
  "rounded-full border border-hair px-4 py-2.5 text-sm font-medium text-paper/85 disabled:opacity-40";

/** Where the step-by-step answer to a request is shown: in the command bar and in the dock. */
export function AssistantPanel({ state }: { state: AssistantState }) {
  const cancel = useApp((s) => s.cancelAssistant);
  const confirmSend = useApp((s) => s.confirmSend);
  const retry = useApp((s) => s.retryAssistant);
  const openSheet = useApp((s) => s.openSheet);
  const t = useT();

  switch (state.status) {
    case "idle":
      return null;
    case "preparing":
      return (
        <Body busy>
          <p>{t("assistant.reading")}</p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              {t("common.cancel")}
            </button>
          </Actions>
        </Body>
      );
    case "preview": {
      const { prepared } = state;
      return (
        <Body>
          <p className="text-sm font-medium text-paper">
            {t("assistant.payloadIntro", { provider: prepared.providerName })}
            {prepared.model ? ` (${prepared.model})` : ""}
          </p>
          <p className="text-xs text-paper/55">
            {t("assistant.payloadNote", { count: prepared.tokenEstimate.toLocaleString() })}
          </p>
          <pre
            aria-label={t("assistant.payloadLabel")}
            tabIndex={0}
            className="max-h-[36vh] overflow-auto rounded-xl border border-hair bg-paper/[0.05] p-3 text-[11px] leading-snug break-words whitespace-pre-wrap text-paper/80 select-text"
          >
            {prepared.payload}
          </pre>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              {t("common.cancel")}
            </button>
            <button type="button" className={primary} onClick={() => void confirmSend()}>
              {t("assistant.send")}
            </button>
          </Actions>
        </Body>
      );
    }
    case "sending":
      return (
        <Body busy>
          <p>{t("assistant.asking", { provider: state.prepared.providerName })}</p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              {t("common.cancel")}
            </button>
          </Actions>
        </Body>
      );
    case "proposal":
      return <ProposalCard proposal={state.proposal} request={state.request} />;
    case "accepting":
      return (
        <Body busy>
          <p>{t("assistant.saving")}</p>
        </Body>
      );
    case "accepted":
      return (
        <Body>
          <p className="text-sm font-medium text-paper">
            {state.proposal.kind === "existingOption"
              ? t("assistant.turnedOn", { option: state.proposal.option.label })
              : t("assistant.addedSwitch", { option: state.proposal.option.label })}
          </p>
          <p className="text-xs text-paper/55">
            {t("assistant.findInSettings", { recipe: state.proposal.recipeName })}
          </p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              {t("common.done")}
            </button>
            <button
              type="button"
              className={primary}
              onClick={() => {
                openSheet("settings");
                cancel();
              }}
            >
              {t("assistant.openInSettings")}
            </button>
          </Actions>
        </Body>
      );
    case "rejected":
      return (
        <Body>
          <p>{t("assistant.nothingChanged")}</p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              {t("common.done")}
            </button>
            <button type="button" className={primary} onClick={() => cancel(true)}>
              {t("assistant.askAgain")}
            </button>
          </Actions>
        </Body>
      );
    case "error":
      return (
        <Body alert>
          <p className="text-sm text-paper">
            {state.error.key ? t(state.error.key) : state.error.text}
          </p>
          <Actions>
            {state.error.kind === "missingKey" && (
              <button type="button" className={quiet} onClick={() => openSheet("settings")}>
                {t("common.openSettings")}
              </button>
            )}
            <button type="button" className={quiet} onClick={() => cancel(true)}>
              {t("assistant.editRequest")}
            </button>
            {state.error.kind !== "noPage" && (
              <button type="button" className={primary} onClick={() => void retry()}>
                {t("common.retry")}
              </button>
            )}
          </Actions>
        </Body>
      );
  }
}

function ProposalCard({ proposal, request }: { proposal: Proposal; request: string }) {
  const accept = useApp((s) => s.acceptProposal);
  const reject = useApp((s) => s.rejectProposal);
  const cancel = useApp((s) => s.cancelAssistant);
  const t = useT();
  const existing = proposal.kind === "existingOption";

  return (
    <Body>
      <p className="truncate text-xs text-paper/45">{t("assistant.requestQuote", { request })}</p>
      <p className="text-sm font-medium text-paper">{proposal.summary}</p>
      <div className="rounded-xl border border-hair bg-paper/[0.05] px-3 py-2.5">
        {existing && (
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
          {proposal.forked ? ` · ${t("assistant.savedAsCopy")}` : ""}
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
      {proposal.unmatched > 0 && (
        <p role="alert" className="text-xs leading-snug text-accent">
          {t("assistant.unmatched", { count: proposal.unmatched })} {t("assistant.unmatchedHint")}
        </p>
      )}
      <p className="text-xs text-paper/50">
        {existing ? t("assistant.resultLive") : t("assistant.resultPreview")}
      </p>
      <Actions>
        <button type="button" className={quiet} onClick={() => cancel(true)}>
          {t("assistant.askAgain")}
        </button>
        <button type="button" className={quiet} onClick={() => void reject()}>
          {t("assistant.reject")}
        </button>
        <button type="button" className={primary} onClick={() => void accept()}>
          {t("assistant.accept")}
        </button>
      </Actions>
    </Body>
  );
}

function Body({ children, busy, alert }: { children: ReactNode; busy?: boolean; alert?: boolean }) {
  return (
    <div
      role={alert ? "alert" : "status"}
      aria-live={alert ? "assertive" : "polite"}
      aria-busy={busy}
      className="flex flex-col gap-2.5 px-2 pt-1 text-sm text-paper/80"
    >
      {children}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2 pt-1">{children}</div>;
}
