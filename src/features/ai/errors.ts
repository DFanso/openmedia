export type AssistantErrorKind =
  | "missingKey"
  | "rateLimit"
  | "network"
  | "provider"
  | "invalid"
  | "nothingMatched"
  | "noPage"
  | "other";

export interface AssistantError {
  kind: AssistantErrorKind;
  /** Fixed text written here, never a provider body or anything the page said. */
  message: string;
}

const MESSAGES: Record<Exclude<AssistantErrorKind, "other">, string> = {
  missingKey: "The provider needs a valid key. Check it in Settings > AI assistant.",
  rateLimit: "The provider is rate limiting this key. Try again shortly.",
  network: "Could not reach the provider. Check your connection.",
  provider: "The provider returned an error. Try again, or pick another model in Settings.",
  invalid: "The model's answer wasn't usable. Try again, or word the request differently.",
  nothingMatched:
    "The proposed change matched nothing on this page. Try describing what to hide differently.",
  noPage: "Open a site first, then describe the change.",
};

export const nothingMatched = (): AssistantError => ({
  kind: "nothingMatched",
  message: MESSAGES.nothingMatched,
});

const OTHER_LIMIT = 160;

/**
 * Maps what a Rust command rejected with onto the fixed taxonomy. Rust sends short fixed texts
 * without keys or provider bodies, so matching on them is safe; anything unknown is shown only
 * if it is short, otherwise replaced by a generic line.
 */
export function classifyError(error: unknown): AssistantError {
  const raw =
    typeof error === "string" ? error : error instanceof Error ? error.message : String(error);
  const text = raw.toLowerCase();

  const kind: AssistantErrorKind = /rate.?limit|quota|too many requests|429/.test(text)
    ? "rateLimit"
    : /\bkey\b|unauthori[sz]ed|\b40[13]\b|no active provider|no provider/.test(text)
      ? "missingKey"
      : /no (open|active) (page|site|session)|open a site/.test(text)
        ? "noPage"
        : /could not reach|network|connect|timed out|timeout|offline|secure connection/.test(text)
          ? "network"
          : /nothing matched|matched nothing|no match/.test(text)
            ? "nothingMatched"
            : /invalid|structure|unusable|refus|not understood|validat|rejected the change/.test(
                  text,
                )
              ? "invalid"
              : /provider|status|server/.test(text)
                ? "provider"
                : "other";

  if (kind === "other") {
    const short = raw.trim().length > 0 && raw.trim().length <= OTHER_LIMIT;
    return { kind, message: short ? raw.trim() : "Something went wrong. Try again." };
  }
  return { kind, message: MESSAGES[kind] };
}
