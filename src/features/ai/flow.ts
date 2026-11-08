import type { PreparedRequest, Proposal } from "./ipc";
import { classifyError, nothingMatched, type AssistantError } from "./errors";

/** One request, from the user's words to a saved switch. */
export type AssistantState =
  | { status: "idle"; draft: string }
  | { status: "preparing"; request: string }
  | { status: "preview"; request: string; prepared: PreparedRequest }
  | { status: "sending"; request: string; prepared: PreparedRequest }
  | { status: "proposal"; request: string; proposal: Proposal }
  | { status: "accepting"; request: string; proposal: Proposal }
  | { status: "accepted"; request: string; proposal: Proposal }
  | { status: "rejected"; request: string }
  /** `jobId` is a prepared request Rust still holds; it must be dropped when leaving. */
  | { status: "error"; request: string; error: AssistantError; jobId: string | null };

export type AssistantEvent =
  | { type: "submit"; request: string }
  /** The user typing in the empty bar: the text stays in the state, so it survives a round trip. */
  | { type: "edit"; text: string }
  /** `preview` false (the user turned the preview off) goes straight to sending. */
  | { type: "prepared"; prepared: PreparedRequest; preview: boolean }
  | { type: "send" }
  | { type: "proposed"; proposal: Proposal }
  | { type: "accept" }
  | { type: "accepted" }
  | { type: "reject" }
  | { type: "failed"; error: unknown }
  /** Back to the empty bar, keeping the request text for editing when `keepText`. */
  | { type: "reset"; keepText?: boolean };

export const initialAssistant: AssistantState = { status: "idle", draft: "" };

/** The prepared request Rust still holds for this state, if any. */
export function pendingJobId(state: AssistantState): string | null {
  switch (state.status) {
    case "preview":
    case "sending":
      return state.prepared.id;
    case "proposal":
    case "accepting":
      return state.proposal.id;
    case "error":
      return state.jobId;
    default:
      return null;
  }
}

/** True when every rule of a new switch matched nothing, so accepting it would do nothing. */
export function matchedNothing(proposal: Proposal): boolean {
  return (
    proposal.kind === "newOption" &&
    proposal.rules.length > 0 &&
    proposal.rules.every((rule) => rule.matches <= 0)
  );
}

const requestOf = (state: AssistantState): string => ("request" in state ? state.request : "");

/** Events that do not fit the current state are ignored, so a late async result cannot revive a cancelled request. */
export function assistantReducer(state: AssistantState, event: AssistantEvent): AssistantState {
  switch (event.type) {
    case "submit": {
      const request = event.request.trim();
      if (request === "") return state;
      if (state.status !== "idle" && state.status !== "error" && state.status !== "rejected") {
        return state;
      }
      return { status: "preparing", request };
    }
    case "edit":
      return state.status === "idle" ? { status: "idle", draft: event.text } : state;
    case "prepared":
      if (state.status !== "preparing") return state;
      return event.preview
        ? { status: "preview", request: state.request, prepared: event.prepared }
        : { status: "sending", request: state.request, prepared: event.prepared };
    case "send":
      return state.status === "preview" ? { ...state, status: "sending" } : state;
    case "proposed":
      if (state.status !== "sending") return state;
      if (matchedNothing(event.proposal)) {
        return {
          status: "error",
          request: state.request,
          error: nothingMatched(),
          jobId: event.proposal.id,
        };
      }
      return { status: "proposal", request: state.request, proposal: event.proposal };
    case "accept":
      return state.status === "proposal" ? { ...state, status: "accepting" } : state;
    case "accepted":
      return state.status === "accepting" ? { ...state, status: "accepted" } : state;
    case "reject":
      return state.status === "proposal" ? { status: "rejected", request: state.request } : state;
    case "failed": {
      if (state.status === "idle" || state.status === "accepted" || state.status === "rejected") {
        return state;
      }
      const jobId =
        state.status === "accepting"
          ? state.proposal.id
          : state.status === "error"
            ? state.jobId
            : null;
      return {
        status: "error",
        request: requestOf(state),
        error: classifyError(event.error),
        jobId,
      };
    }
    case "reset":
      return { status: "idle", draft: event.keepText ? requestOf(state) : "" };
  }
}
