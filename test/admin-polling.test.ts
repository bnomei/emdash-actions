import { describe, expect, it, vi } from "vitest";
import {
  isErrorResult,
  isSuccessfulTerminalResult,
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
});
