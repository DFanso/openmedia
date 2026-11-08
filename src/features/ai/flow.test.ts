import { describe, expect, it } from "vitest";
import { assistantReducer, initialAssistant, matchedNothing, pendingJobId } from "./flow";
import type { AssistantEvent, AssistantState } from "./flow";
import { prepared, proposal } from "./fixtures";

const run = (events: AssistantEvent[], from: AssistantState = initialAssistant) =>
  events.reduce(assistantReducer, from);

describe("assistant flow", () => {
  it("goes through the preview to a proposal and accepted", () => {
    const states = [
      { type: "submit", request: " hide it " },
      { type: "prepared", prepared, preview: true },
    ] as const;
    const preview = run([...states]);
    expect(preview).toEqual({ status: "preview", request: "hide it", prepared });
    const accepted = run(
      [{ type: "send" }, { type: "proposed", proposal }, { type: "accept" }, { type: "accepted" }],
      preview,
    );
    expect(accepted.status).toBe("accepted");
  });

  it("skips the preview when it is off", () => {
    const state = run([
      { type: "submit", request: "x" },
      { type: "prepared", prepared, preview: false },
    ]);
    expect(state.status).toBe("sending");
  });

  it("ignores blank requests and events that do not fit", () => {
    expect(run([{ type: "submit", request: "  " }])).toBe(initialAssistant);
    expect(run([{ type: "proposed", proposal }])).toBe(initialAssistant);
    expect(run([{ type: "accept" }])).toBe(initialAssistant);
    const preparing = run([{ type: "submit", request: "a" }]);
    expect(assistantReducer(preparing, { type: "submit", request: "b" })).toBe(preparing);
  });

  it("keeps what the user typed in the empty bar and ignores edits mid-request", () => {
    const typed = run([{ type: "edit", text: "hide stories" }]);
    expect(typed).toEqual({ status: "idle", draft: "hide stories" });
    const preparing = run([{ type: "submit", request: "a" }]);
    expect(assistantReducer(preparing, { type: "edit", text: "b" })).toBe(preparing);
  });

  it("drops a late result after cancel", () => {
    const cancelled = run([
      { type: "submit", request: "a" },
      { type: "reset" },
      { type: "prepared", prepared, preview: true },
    ]);
    expect(cancelled).toEqual({ status: "idle", draft: "" });
  });

  it("reject returns to rejected and ask again keeps the text", () => {
    const rejected = run([
      { type: "submit", request: "hide stories" },
      { type: "prepared", prepared, preview: false },
      { type: "proposed", proposal },
      { type: "reject" },
    ]);
    expect(rejected).toEqual({ status: "rejected", request: "hide stories" });
    expect(assistantReducer(rejected, { type: "reset", keepText: true })).toEqual({
      status: "idle",
      draft: "hide stories",
    });
  });

  it("maps failures to the taxonomy and keeps the job to drop", () => {
    const failed = run([
      { type: "submit", request: "a" },
      { type: "prepared", prepared, preview: false },
      { type: "failed", error: "The provider is rate limiting this key. Try again shortly." },
    ]);
    expect(failed).toMatchObject({ status: "error", error: { kind: "rateLimit" }, jobId: null });
    const retried = assistantReducer(failed, { type: "submit", request: "a" });
    expect(retried.status).toBe("preparing");
  });

  it("turns a proposal where nothing matched into the nothing-matched error", () => {
    const none = {
      ...proposal,
      unmatched: 2,
      rules: proposal.rules.map((r) => ({ ...r, matches: 0 })),
    };
    expect(matchedNothing(none)).toBe(true);
    expect(matchedNothing(proposal)).toBe(false);
    const state = run([
      { type: "submit", request: "a" },
      { type: "prepared", prepared, preview: false },
      { type: "proposed", proposal: none },
    ]);
    expect(state).toMatchObject({
      status: "error",
      error: { kind: "nothingMatched" },
      jobId: "job-1",
    });
    expect(pendingJobId(state)).toBe("job-1");
  });

  it("does not treat an existing switch as matching nothing", () => {
    const existing = { ...proposal, kind: "existingOption" as const, rules: [], unmatched: 0 };
    expect(matchedNothing(existing)).toBe(false);
  });

  it("a failed accept keeps the job so it can be dropped", () => {
    const state = run([
      { type: "submit", request: "a" },
      { type: "prepared", prepared, preview: false },
      { type: "proposed", proposal },
      { type: "accept" },
      { type: "failed", error: "could not read or write the library: x" },
    ]);
    expect(state).toMatchObject({ status: "error", jobId: "job-1" });
  });
});
