import { describe, expect, it } from "vitest";
import type { UpdateStatus } from "../../shared/ipc";
import { initialResult, summarizeUpdates } from "./updateResult";

const status = (pendingRevision: number | null): UpdateStatus => ({
  runtimeVersion: "1.0.0",
  runningRevision: null,
  pendingRevision,
  selfUpdate: false,
});

describe("summarizeUpdates", () => {
  it("puts a new app version ahead of a downloaded web bundle", () => {
    const result = summarizeUpdates(
      { kind: "staged", revision: 2 },
      { version: "1.1.0", notes: null },
    );
    expect(result).toEqual({ kind: "app", version: "1.1.0" });
  });

  it("reports a downloaded web bundle when there is no new app", () => {
    expect(summarizeUpdates({ kind: "staged", revision: 2 }, null)).toEqual({ kind: "staged" });
  });

  it("says current only when neither has anything", () => {
    expect(summarizeUpdates({ kind: "upToDate" }, null)).toEqual({ kind: "current" });
  });
});

describe("initialResult", () => {
  it("shows a bundle already waiting for the next launch", () => {
    expect(initialResult(status(5))).toEqual({ kind: "staged" });
    expect(initialResult(status(null))).toEqual({ kind: "none" });
    expect(initialResult(null)).toEqual({ kind: "none" });
  });
});
