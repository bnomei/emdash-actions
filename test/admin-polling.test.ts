import { describe, expect, it, vi } from "vitest";
import {
  isErrorResult,
  isSuccessfulTerminalResult,
  normalizePollResult,
  pollDelayMs,
  shouldContinuePolling,
  waitForActionResult,
} from "../src/admin-polling";
import type { ActionDescriptor } from "../src/types";

const action: ActionDescriptor = {
  id: "publish",
  label: "Publish",
  route: "publish",
};

describe("admin action polling", () => {
  it("returns terminal results without polling", async () => {
    const pollActionStatus = vi.fn();

    await expect(
      waitForActionResult(action, { ok: true, status: 200 }, () => undefined, pollActionStatus),
    ).resolves.toEqual({ ok: true, status: 200 });
    expect(pollActionStatus).not.toHaveBeenCalled();
  });

  it("polls accepted action results at least once and reports progress", async () => {
    let now = 0;
    const progress: unknown[] = [];
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const pollActionStatus = vi.fn(async () => ({
      jobStatus: "succeeded" as const,
      ok: true,
      status: 200,
    }));

    const result = await waitForActionResult(
      { ...action, resultMode: "emdash-action-accepted-v1" },
      { ok: true, statusRoute: "/jobs/1" },
      (value) => progress.push(value),
      pollActionStatus,
      undefined,
      { now: () => now, sleep },
    );

    expect(result).toEqual({ jobStatus: "succeeded", ok: true, status: 200 });
    expect(progress).toEqual([{ ok: true, statusRoute: "/jobs/1" }]);
    expect(sleep).toHaveBeenCalledWith(1500, undefined);
    expect(pollActionStatus).toHaveBeenCalledWith(
      { ...action, resultMode: "emdash-action-accepted-v1" },
      "jobs/1",
      undefined,
    );
  });

  it("times out pending jobs without live services", async () => {
    let now = 1000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const pollActionStatus = vi.fn(async () => ({
      ok: true,
      status: 202,
      statusRoute: "jobs/1",
    }));

    await expect(
      waitForActionResult(
        { ...action, pollTimeoutMs: 250 },
        { ok: true, status: 202, statusRoute: "jobs/1" },
        () => undefined,
        pollActionStatus,
        undefined,
        { now: () => now, sleep },
      ),
    ).rejects.toThrow(/still running/);

    expect(pollActionStatus).toHaveBeenCalledTimes(1);
  });

  it("clamps the poll sleep to the remaining timeout budget", async () => {
    let now = 1000;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const pollActionStatus = vi.fn(async () => ({
      ok: true,
      status: 202,
      statusRoute: "jobs/1",
    }));

    await expect(
      waitForActionResult(
        { ...action, pollIntervalMs: 1500, pollTimeoutMs: 250 },
        { ok: true, status: 202, statusRoute: "jobs/1" },
        () => undefined,
        pollActionStatus,
        undefined,
        { now: () => now, sleep },
      ),
    ).rejects.toThrow(/still running/);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250, undefined);
    expect(pollActionStatus).toHaveBeenCalledTimes(1);
  });

  it("does not return a terminal poll result after the run was aborted", async () => {
    const controller = new AbortController();
    let now = 0;
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });
    const pollActionStatus = vi.fn(async () => {
      controller.abort();
      return { jobStatus: "succeeded" as const, ok: true, status: 200 };
    });

    await expect(
      waitForActionResult(
        action,
        { ok: true, status: 202, statusRoute: "jobs/1" },
        () => undefined,
        pollActionStatus,
        controller.signal,
        { now: () => now, sleep },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects on the non-polling fast path when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForActionResult(
        action,
        { ok: true, status: 200 },
        () => undefined,
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("classifies pending, failed, and successful terminal polling states", () => {
    expect(shouldContinuePolling({ ok: true, status: 202 })).toBe(true);
    expect(shouldContinuePolling({ jobStatus: "running", ok: true, status: 200 })).toBe(true);
    expect(isErrorResult({ jobStatus: "failed", ok: true, status: 200 })).toBe(true);
    expect(isErrorResult({ ok: false, status: 200 })).toBe(true);
    expect(
      isErrorResult({ effects: { reload: { scope: "entry" } }, severity: "warning", status: 409 }),
    ).toBe(false);
    expect(isSuccessfulTerminalResult({ jobStatus: "succeeded", ok: true, status: 200 })).toBe(
      true,
    );
    expect(shouldContinuePolling({ jobStatus: "succeeded", ok: true, status: 202 })).toBe(false);
    expect(isSuccessfulTerminalResult({ jobStatus: "succeeded", ok: true, status: 202 })).toBe(
      true,
    );

    expect(shouldContinuePolling({ jobStatus: "processing", ok: true, status: 200 })).toBe(true);
    expect(shouldContinuePolling({ jobStatus: "in_progress", ok: true, status: 202 })).toBe(true);
    expect(isSuccessfulTerminalResult({ jobStatus: "processing", ok: true, status: 200 })).toBe(
      false,
    );
    expect(isErrorResult({ jobStatus: "processing", ok: true, status: 200 })).toBe(false);
    expect(
      isSuccessfulTerminalResult({
        effects: { reload: { scope: "entry" } },
        severity: "warning",
        status: 409,
      }),
    ).toBe(true);
  });

  it("clamps poll delays from result and action options", () => {
    expect(pollDelayMs(action, { pollAfterMs: 10 })).toBe(250);
    expect(pollDelayMs({ ...action, pollIntervalMs: 60000 }, {})).toBe(30000);
  });

  it("keeps polling on a plain-string status body instead of ending early", () => {
    const pending = normalizePollResult(action, "jobs/1", "still working");
    expect(pending).toEqual({
      ok: true,
      status: 202,
      statusRoute: "jobs/1",
      message: "still working",
    });
    expect(shouldContinuePolling(pending)).toBe(true);
    expect(isSuccessfulTerminalResult(pending)).toBe(false);

    expect(
      normalizePollResult(action, "jobs/1", { ok: true, status: 200, jobStatus: "succeeded" }),
    ).toEqual({ ok: true, status: 200, jobStatus: "succeeded" });
  });
});
