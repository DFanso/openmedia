import { useRef, useState } from "react";
import { describeError } from "../../i18n/errors";
import { useT } from "../../i18n/useT";
import { Switch } from "../settings/Switch";
import { DurationSlider } from "./DurationSlider";
import { formatDuration, sectionLabel } from "./format";
import {
  DEFAULT_LIMIT_MINUTES,
  LIMIT_PRESETS,
  MAX_LIMIT_MINUTES,
  policyOf,
  reconcile,
  stopsFor,
  suggestedWarn,
  thresholdsOf,
  warnStops,
  withPreset,
  type Thresholds,
} from "./limits";
import { usagePolicies, usageSectionPolicies, type UsagePolicy } from "./policy";
import { MeterCaption, UsageMeter } from "./UsageMeter";

function Chips({
  values,
  current,
  onPick,
}: {
  values: readonly number[];
  current: number | null;
  onPick: (minutes: number) => void;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={t("usage.quickPicks")} className="flex flex-wrap gap-2">
      {values.map((minutes) => (
        <button
          key={minutes}
          type="button"
          aria-pressed={current === minutes}
          onClick={() => onPick(minutes)}
          className={`min-w-14 rounded-full border px-4 py-2 text-sm font-medium tabular-nums active:bg-paper/[0.08] ${
            current === minutes
              ? "border-accent bg-accent/10 text-accent"
              : "border-hair text-paper/80"
          }`}
        >
          {formatDuration(minutes * 60, t)}
        </button>
      ))}
    </div>
  );
}

interface LimitEditorProps {
  host: string;
  policy: UsagePolicy | undefined;
  spentSeconds: number;
  section?: string;
}

/**
 * Sets a site's or section's daily reminder and limit with sliders. Nothing needs typing and
 * nothing needs a Save button: a drag follows the thumb on screen and is saved when the finger lifts.
 */
export function LimitEditor({ host, policy, spentSeconds, section }: LimitEditorProps) {
  const t = useT();
  const [draft, setDraft] = useState<Thresholds | null>(null);
  const [error, setError] = useState("");
  const saves = useRef(0);
  const committed = thresholdsOf(policy);
  const targetLabel = section ? `${host} · ${sectionLabel(section, t)}` : host;
  const shown = draft ?? committed;
  const stops = stopsFor(committed.warn, committed.limit);
  const active = shown.warn !== null || shown.limit !== null;

  const save = async (next: Thresholds) => {
    if (next.warn === committed.warn && next.limit === committed.limit) {
      setDraft(null);
      return;
    }
    const id = ++saves.current;
    setError("");
    setDraft(next);
    try {
      if (section) await usageSectionPolicies.set(host, section, policyOf(next));
      else await usagePolicies.set(host, policyOf(next));
    } catch (cause) {
      setError(describeError(cause, t));
    } finally {
      if (saves.current === id) setDraft(null);
    }
  };

  const moved = (changed: "warn" | "limit", minutes: number) =>
    reconcile(changed, { ...shown, [changed]: minutes }, stops);

  const toggleLimit = (on: boolean) => {
    if (!on) return void save({ ...shown, limit: null });
    const { warn } = shown;
    const above = warn === null ? undefined : stops.find((stop) => stop > warn);
    const limit =
      warn !== null && warn >= DEFAULT_LIMIT_MINUTES
        ? (above ?? MAX_LIMIT_MINUTES)
        : DEFAULT_LIMIT_MINUTES;
    void save(reconcile("limit", { ...shown, limit }, stops));
  };

  const toggleWarn = (on: boolean) => {
    if (!on) return void save({ ...shown, warn: null });
    const warn =
      shown.limit === null
        ? DEFAULT_LIMIT_MINUTES
        : (suggestedWarn(shown.limit, stops) ?? stops[0]);
    void save(reconcile("warn", { ...shown, warn }, stops));
  };

  return (
    <div className="border-t border-hair">
      <div className="px-4 pt-4 pb-4">
        <MeterCaption spentSeconds={spentSeconds} policy={policyOf(shown)} />
        {active && (
          <div className="mt-2.5">
            <UsageMeter spentSeconds={spentSeconds} policy={policyOf(shown)} />
          </div>
        )}
      </div>

      {active ? (
        <div className="divide-y divide-hair border-t border-hair">
          <div>
            <Switch
              label={t("usage.pauseAfter")}
              description={t("usage.pauseAfterHint")}
              checked={shown.limit !== null}
              onChange={toggleLimit}
            />
            {shown.limit !== null && (
              <div className="flex flex-col gap-2 px-4 pb-4">
                <DurationSlider
                  label={t("usage.sliderLimit", { host: targetLabel })}
                  stops={stops}
                  value={shown.limit}
                  onScrub={(minutes) => setDraft(moved("limit", minutes))}
                  onCommit={(minutes) => void save(moved("limit", minutes))}
                />
                <Chips
                  values={LIMIT_PRESETS}
                  current={shown.limit}
                  onPick={(minutes) => void save(moved("limit", minutes))}
                />
              </div>
            )}
          </div>
          <div>
            <Switch
              label={t("usage.remindAt")}
              description={t("usage.remindAtHint")}
              checked={shown.warn !== null}
              onChange={toggleWarn}
            />
            {shown.warn !== null && (
              <div className="px-4 pb-4">
                <DurationSlider
                  label={t("usage.sliderReminder", { host: targetLabel })}
                  stops={warnStops(stops)}
                  value={shown.warn}
                  onScrub={(minutes) => setDraft(moved("warn", minutes))}
                  onCommit={(minutes) => void save(moved("warn", minutes))}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-hair px-4 py-4">
          <p className="mb-3 text-sm leading-snug text-paper/60">{t("usage.presetsHint")}</p>
          <Chips
            values={LIMIT_PRESETS}
            current={null}
            onPick={(minutes) => void save(withPreset(minutes))}
          />
        </div>
      )}

      <p className="px-4 pb-3 text-[13px] text-paper/45">{t("usage.saveHint")}</p>
      {error && (
        <p role="alert" className="px-4 pb-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
