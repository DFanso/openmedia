import { describe, expect, it, vi } from "vitest";
import {
  hasBackHandler,
  pushBackHandler,
  runBackHandler,
  subscribeBackHandlers,
} from "./backStack";

describe("back handlers", () => {
  it("runs the newest handler first and reports when nothing wants the press", () => {
    const calls: string[] = [];
    const removeFan = pushBackHandler(() => calls.push("fan"));
    const removeSheet = pushBackHandler(() => calls.push("sheet"));

    expect(runBackHandler()).toBe(true);
    removeSheet();
    expect(runBackHandler()).toBe(true);
    removeFan();

    expect(calls).toEqual(["sheet", "fan"]);
    expect(runBackHandler()).toBe(false);
    expect(hasBackHandler()).toBe(false);
  });

  it("removes the right handler when an older one closes first", () => {
    const calls: string[] = [];
    const removeFirst = pushBackHandler(() => calls.push("first"));
    const removeSecond = pushBackHandler(() => calls.push("second"));

    removeFirst();
    runBackHandler();
    removeSecond();

    expect(calls).toEqual(["second"]);
    expect(hasBackHandler()).toBe(false);
  });

  it("tells subscribers when the stack gains or loses a handler", () => {
    const listener = vi.fn();
    const stop = subscribeBackHandlers(listener);

    const remove = pushBackHandler(() => {});
    remove();
    remove();
    stop();

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
