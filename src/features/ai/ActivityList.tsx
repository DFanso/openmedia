import { useT } from "../../i18n/useT";
import { Spinner } from "../../shared/Spinner";
import type { Translate } from "../../i18n/translate";
import type { ActivityStep } from "./ipc";

/** The sentence for one step. `provider` is the name the user gave the provider that was asked. */
export function stepLabel(step: ActivityStep, provider: string, t: Translate): string {
  const running = step.status === "running";
  const failed = step.status === "failed";
  switch (step.kind) {
    case "readPage":
      return running
        ? t("assistant.reading")
        : t("assistant.stepReadPage", { count: (step.total ?? 0).toLocaleString() });
    case "askModel":
      if (running) return t("assistant.asking", { provider });
      return t(failed ? "assistant.stepAskFailed" : "assistant.stepAsked", { provider });
    case "checkAnswer":
      return t(failed ? "assistant.stepCheckFailed" : "assistant.stepCheck");
    case "previewOnPage":
      return t("assistant.stepPreview");
    case "countMatches":
      return t("assistant.stepCount", { matched: step.matched ?? 0, total: step.total ?? 0 });
    case "repair":
      return t(step.total === null ? "assistant.stepRepairInvalid" : "assistant.stepRepairRules");
  }
}

function StepMark({ status }: { status: ActivityStep["status"] }) {
  if (status === "running") {
    return <Spinner size={14} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`w-3.5 shrink-0 text-center ${status === "done" ? "text-paper/55" : "text-accent"}`}
    >
      {status === "done" ? "✓" : "✕"}
    </span>
  );
}

/** What the assistant did for a request, one line per step, as it happens. */
export function ActivityList({
  steps,
  provider,
}: {
  steps: readonly ActivityStep[];
  provider: string | null;
}) {
  const t = useT();
  if (steps.length === 0) return null;
  const name = provider ?? t("assistant.theModel");

  return (
    <ul role="log" aria-live="polite" className="flex flex-col gap-1.5 ps-1">
      {steps.map((step) => (
        <li
          key={`${step.kind}-${step.round}`}
          className={`flex items-center gap-2 text-xs leading-snug ${
            step.status === "failed" ? "text-accent" : "text-paper/65"
          }`}
        >
          <StepMark status={step.status} />
          <span className="min-w-0">{stepLabel(step, name, t)}</span>
        </li>
      ))}
    </ul>
  );
}
