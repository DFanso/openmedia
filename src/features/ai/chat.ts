import type { AssistantState } from "./flow";
import type { ChatSession, ChatTurn, EarlierTurn, TurnOutcome } from "./ipc";

/** Turns kept in one chat; Rust keeps the same number. */
export const MAX_TURNS = 40;
const MAX_TITLE_CHARS = 60;

const outcomeOf = (state: AssistantState): TurnOutcome | null => {
  switch (state.status) {
    case "proposal":
      return { status: "proposed", proposal: state.proposal };
    case "accepted":
      return { status: "accepted", proposal: state.proposal };
    case "rejected":
      return { status: "rejected", proposal: state.proposal };
    case "error":
      return { status: "failed", kind: state.error.kind, text: state.error.text };
    default:
      return null;
  }
};

/**
 * What the request in flight becomes in the chat: its steps and how it stands. `null` while
 * there is nothing to keep (reading, sending, saving): an interrupted request leaves no trace.
 */
export function turnOf(state: AssistantState, at: number): ChatTurn | null {
  const outcome = outcomeOf(state);
  if (!outcome || !("turnId" in state)) return null;
  return {
    id: state.turnId,
    request: state.request,
    at,
    provider: state.provider,
    steps: state.steps,
    outcome,
  };
}

export function newSession(id: string, domain: string, now: number): ChatSession {
  return {
    id,
    domain,
    recipeId: null,
    recipeName: null,
    title: "",
    createdAt: now,
    updatedAt: now,
    turns: [],
  };
}

/**
 * The chat with `turn` added, or with the turn of the same id replaced (a proposal that was
 * accepted). The chat takes the recipe of the latest proposal, so it stays attached to it.
 */
export function withTurn(session: ChatSession, turn: ChatTurn, now: number): ChatSession {
  const existing = session.turns.find((t) => t.id === turn.id);
  const turns = existing
    ? session.turns.map((t) => (t.id === turn.id ? { ...turn, at: t.at } : t))
    : [...session.turns, turn].slice(-MAX_TURNS);
  const proposal = turn.outcome.status === "failed" ? null : turn.outcome.proposal;
  return {
    ...session,
    title: session.title || [...turns[0].request].slice(0, MAX_TITLE_CHARS).join(""),
    recipeId: proposal?.recipeId ?? session.recipeId,
    recipeName: proposal?.recipeName ?? session.recipeName,
    updatedAt: now,
    turns,
  };
}

/** The chats of a site that have something in them, the most recently used first. */
export function savedFor(chats: readonly ChatSession[], domain: string): ChatSession[] {
  return chats
    .filter((chat) => chat.domain === domain && chat.turns.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface ChatFocus {
  activeId: string | null;
  /** The site the user started a blank chat for: reopening the bar there stays blank. */
  blankDomain: string | null;
}

/**
 * Which chat the bar continues for the site on screen: the one already open for it, a blank one
 * the user asked for, else the site's most recent chat.
 */
export function resolveFocus(
  chats: readonly ChatSession[],
  domain: string | null,
  focus: ChatFocus,
): ChatFocus {
  if (domain === null) return { activeId: null, blankDomain: null };
  const active = chats.find((chat) => chat.id === focus.activeId);
  if (active?.domain === domain) return { activeId: active.id, blankDomain: null };
  if (focus.activeId === null && focus.blankDomain === domain) return focus;
  return { activeId: savedFor(chats, domain)[0]?.id ?? null, blankDomain: null };
}

/** What the next request's prompt is told about this chat: the user's words and how each ended. */
export function earlierOf(session: ChatSession | undefined, exceptTurnId: string): EarlierTurn[] {
  return (session?.turns ?? [])
    .filter((turn) => turn.id !== exceptTurnId)
    .map((turn) => ({
      request: turn.request,
      outcome:
        turn.outcome.status === "accepted"
          ? "applied"
          : turn.outcome.status === "failed"
            ? "failed"
            : "rejected",
    }));
}
