import type { ReactNode } from "react";
import { useApp } from "../../app/store";
import type { AssistantState } from "./flow";
import type { Proposal } from "./ipc";

const primary =
  "rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent disabled:opacity-40";
const quiet =
  "rounded-full border border-hair px-4 py-2.5 text-sm font-medium text-paper/85 disabled:opacity-40";

const GROUP_LABELS = { annoyance: "Annoyance", content: "Content" } as const;

/** Where the step-by-step answer to a request is shown: in the command bar and in the dock. */
export function AssistantPanel({ state }: { state: AssistantState }) {
  const cancel = useApp((s) => s.cancelAssistant);
  const confirmSend = useApp((s) => s.confirmSend);
  const retry = useApp((s) => s.retryAssistant);
  const openSheet = useApp((s) => s.openSheet);

  switch (state.status) {
    case "idle":
      return null;
    case "preparing":
      return (
        <Body busy>
          <p>Reading the page…</p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              Cancel
            </button>
          </Actions>
        </Body>
      );
    case "preview": {
      const { prepared } = state;
      return (
        <Body>
          <p className="text-sm font-medium text-paper">
            This is exactly what will be sent to {prepared.providerName}
            {prepared.model ? ` (${prepared.model})` : ""}
          </p>
          <p className="text-xs text-paper/55">
            About {prepared.tokenEstimate.toLocaleString()} tokens. Only the page&apos;s structure,
            with personal details removed: no cookies, passwords or typed text.
          </p>
          <pre
            aria-label="Exact payload"
            tabIndex={0}
            className="max-h-[36vh] overflow-auto rounded-xl border border-hair bg-paper/[0.05] p-3 text-[11px] leading-snug break-words whitespace-pre-wrap text-paper/80 select-text"
          >
            {prepared.payload}
          </pre>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              Cancel
            </button>
            <button type="button" className={primary} onClick={() => void confirmSend()}>
              Send
            </button>
          </Actions>
        </Body>
      );
    }
    case "sending":
      return (
        <Body busy>
          <p>Asking {state.prepared.providerName}…</p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              Cancel
            </button>
          </Actions>
        </Body>
      );
    case "proposal":
      return <ProposalCard proposal={state.proposal} request={state.request} />;
    case "accepting":
      return (
        <Body busy>
          <p>Saving…</p>
        </Body>
      );
    case "accepted":
      return (
        <Body>
          <p className="text-sm font-medium text-paper">
            {state.proposal.kind === "existingOption"
              ? `Turned on “${state.proposal.option.label}”.`
              : `Added the switch “${state.proposal.option.label}”.`}
          </p>
          <p className="text-xs text-paper/55">
            Find it in Settings &gt; Pre-made recipes, under {state.proposal.recipeName}.
          </p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              Done
            </button>
            <button
              type="button"
              className={primary}
              onClick={() => {
                openSheet("settings");
                cancel();
              }}
            >
              Open in Settings
            </button>
          </Actions>
        </Body>
      );
    case "rejected":
      return (
        <Body>
          <p>Nothing was changed. The preview is gone.</p>
          <Actions>
            <button type="button" className={quiet} onClick={() => cancel()}>
              Done
            </button>
            <button type="button" className={primary} onClick={() => cancel(true)}>
              Ask again
            </button>
          </Actions>
        </Body>
      );
    case "error":
      return (
        <Body alert>
          <p className="text-sm text-paper">{state.error.message}</p>
          <Actions>
            {state.error.kind === "missingKey" && (
              <button type="button" className={quiet} onClick={() => openSheet("settings")}>
                Open Settings
              </button>
            )}
            <button type="button" className={quiet} onClick={() => cancel(true)}>
              Edit request
            </button>
            {state.error.kind !== "noPage" && (
              <button type="button" className={primary} onClick={() => void retry()}>
                Retry
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
  const existing = proposal.kind === "existingOption";

  return (
    <Body>
      <p className="truncate text-xs text-paper/45">“{request}”</p>
      <p className="text-sm font-medium text-paper">{proposal.summary}</p>
      <div className="rounded-xl border border-hair bg-paper/[0.05] px-3 py-2.5">
        {existing && <p className="text-xs font-medium text-accent">This switch already exists</p>}
        <p className="text-sm font-medium text-paper">{proposal.option.label}</p>
        {proposal.option.description && (
          <p className="text-xs leading-snug text-paper/60">{proposal.option.description}</p>
        )}
        <p className="mt-1 text-[11px] tracking-wide text-paper/45 uppercase">
          {GROUP_LABELS[proposal.option.group]} · {proposal.recipeName}
          {proposal.forked ? " · saved as your changed copy" : ""}
        </p>
        {proposal.rules.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-t border-hair pt-2">
            {proposal.rules.map((rule, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-paper/80">{rule.label}</span>
                <span className={`shrink-0 ${rule.matches > 0 ? "text-paper/55" : "text-accent"}`}>
                  matched {Math.max(rule.matches, 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {proposal.unmatched > 0 && (
        <p role="alert" className="text-xs leading-snug text-accent">
          {proposal.unmatched === 1
            ? "One rule matched nothing on this page."
            : `${proposal.unmatched} rules matched nothing on this page.`}{" "}
          It may not hide anything there; you can still accept the rest.
        </p>
      )}
      <p className="text-xs text-paper/50">
        {existing
          ? "The page shows the result now. Accept turns the switch on."
          : "The page shows the result now, not saved yet."}
      </p>
      <Actions>
        <button type="button" className={quiet} onClick={() => cancel(true)}>
          Ask again
        </button>
        <button type="button" className={quiet} onClick={() => void reject()}>
          Reject
        </button>
        <button type="button" className={primary} onClick={() => void accept()}>
          Accept
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
