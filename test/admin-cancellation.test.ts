import { describe, expect, it, vi } from "vitest";
import { isAbortError, sleep, throwIfAborted } from "../src/admin-cancellation";

describe("abortable action helpers", () => {
  it("rejects sleep immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(1000, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels an active sleep and clears its timeout", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleep(1000, controller.signal);

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("identifies cancellation errors and throws for aborted signals", () => {
    const controller = new AbortController();
    controller.abort();

    expect(() => throwIfAborted(controller.signal)).toThrowError(/aborted/i);
    expect(isAbortError(new DOMException("stop", "AbortError"))).toBe(true);
    expect(isAbortError(new Error("network"))).toBe(false);
  });
});
