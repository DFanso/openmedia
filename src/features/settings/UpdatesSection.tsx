import { useEffect, useState } from "react";
import { describeError } from "../../i18n/errors";
import type { Translate } from "../../i18n/translate";
import { useT } from "../../i18n/useT";
import { updates, type UpdateStatus } from "../../shared/ipc";
import { Group, Section, primaryButton, quietButton } from "./ui";
import { initialResult, summarizeUpdates, type UpdateResult } from "./updateResult";

type Phase = "idle" | "checking" | "installing";

/**
 * Checks for the two kinds of update. The web layer downloads by itself and starts on the next
 * launch; a new native app (desktop builds outside the stores) asks before it installs.
 */
export function UpdatesSection() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [result, setResult] = useState<UpdateResult>({ kind: "none" });
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    updates.status().then(
      (next) => {
        setStatus(next);
        setResult(initialResult(next));
      },
      () => undefined,
    );
  }, []);

  const check = async () => {
    setPhase("checking");
    setFailure(null);
    try {
      const [web, app] = await Promise.all([
        updates.checkWeb(),
        status?.selfUpdate ? updates.checkApp() : Promise.resolve(null),
      ]);
      setResult(summarizeUpdates(web, app));
      setStatus(await updates.status());
    } catch (error) {
      setFailure(describeError(error, t));
    } finally {
      setPhase("idle");
    }
  };

  const install = async () => {
    setPhase("installing");
    setFailure(null);
    try {
      await updates.installApp();
    } catch (error) {
      setFailure(describeError(error, t));
      setPhase("idle");
    }
  };

  return (
    <Section title={t("settings.updates")} note={t("settings.updatesNote")}>
      <Group>
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <div className="text-base">
              {t("settings.updatesVersion", { version: version(status) })}
            </div>
            <div className="text-sm text-paper/55">{failure ?? message(result, t)}</div>
          </div>
          {result.kind === "app" ? (
            <button
              type="button"
              disabled={phase !== "idle"}
              onClick={() => void install()}
              className={primaryButton}
            >
              {phase === "installing"
                ? t("settings.updatesInstalling")
                : t("settings.updatesInstall")}
            </button>
          ) : (
            <button
              type="button"
              disabled={phase !== "idle" || status === null}
              onClick={() => void check()}
              className={quietButton}
            >
              {phase === "checking" ? t("settings.updatesChecking") : t("settings.updatesCheck")}
            </button>
          )}
        </div>
      </Group>
    </Section>
  );
}

function version(status: UpdateStatus | null): string {
  if (!status) return "";
  return status.runningRevision === null
    ? status.runtimeVersion
    : `${status.runtimeVersion} (${status.runningRevision})`;
}

function message(result: UpdateResult, t: Translate): string {
  switch (result.kind) {
    case "app":
      return t("settings.updatesAppAvailable", { version: result.version });
    case "staged":
      return t("settings.updatesStaged");
    case "current":
      return t("settings.updatesCurrent");
    case "none":
      return "";
  }
}
