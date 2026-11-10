import type { AppUpdate, UpdateStatus, WebUpdateOutcome } from "../../shared/ipc";

/** What the Updates section tells the user after a check, most important first. */
export type UpdateResult =
  { kind: "none" } | { kind: "current" } | { kind: "staged" } | { kind: "app"; version: string };

/** A new app version needs an install; a downloaded web bundle only needs a relaunch. */
export function summarizeUpdates(web: WebUpdateOutcome, app: AppUpdate | null): UpdateResult {
  if (app) return { kind: "app", version: app.version };
  return web.kind === "staged" ? { kind: "staged" } : { kind: "current" };
}

/** The result to show before any check: a bundle already waiting for the next launch. */
export function initialResult(status: UpdateStatus | null): UpdateResult {
  return status?.pendingRevision != null ? { kind: "staged" } : { kind: "none" };
}
