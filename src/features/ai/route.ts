import type { AiState } from "../../shared/ipc";
import { normalizeWebUrl } from "../../shared/url";

export const MAX_REQUEST_LENGTH = 400;

export type Route =
  | { kind: "empty" }
  | { kind: "address"; url: string }
  | { kind: "request"; request: string }
  | { kind: "blocked"; reason: "noProvider" | "noPage" };

export interface RouteContext {
  /** `null` while provider settings have not loaded. */
  ai: AiState | null;
  /** The address of the page the user is on, when a site is open. */
  pageUrl: string | null;
}

/** True when an active provider exists and has a key. */
export function providerReady(ai: AiState | null): boolean {
  const active = ai?.providers.find((p) => p.id === ai.activeId);
  return active?.hasKey === true;
}

const isSitePage = (url: string | null): boolean => url !== null && /^https?:\/\//i.test(url);

/** Anything that parses as a web address opens it; any other text is a request for the assistant. */
export function routeInput(text: string, context: RouteContext): Route {
  const trimmed = text.trim();
  if (trimmed === "") return { kind: "empty" };
  const url = normalizeWebUrl(trimmed);
  if (url) return { kind: "address", url };
  if (!providerReady(context.ai)) return { kind: "blocked", reason: "noProvider" };
  if (!isSitePage(context.pageUrl)) return { kind: "blocked", reason: "noPage" };
  return { kind: "request", request: trimmed.slice(0, MAX_REQUEST_LENGTH) };
}

export const BLOCKED_MESSAGES = {
  noProvider: "Add an AI provider and key to ask for changes. Addresses still work.",
  noPage: "Open a site first, then describe the change.",
} as const;
