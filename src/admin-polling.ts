import { normalizePluginRoute } from "./shared";
import { sleep as defaultSleep, throwIfAborted } from "./admin-cancellation";
import { asRecord, numberOrNull } from "./admin-manifest";
import { normalizeActionRunResult } from "./admin-effects";
import type { ActionManifestDescriptor, ActionRunResult } from "./types";
import { localizedString } from "./i18n";

const PENDING_JOB_STATUSES = new Set<string>(["accepted", "queued", "running"]);
const FAILED_JOB_STATUSES = new Set<string>(["failed", "cancelled"]);
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 30000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;
const MAX_POLL_TIMEOUT_MS = 900000;

type PollStatus<TAction extends ActionManifestDescriptor> = (
  action: TAction,
  statusRoute: string,
  signal?: AbortSignal,
) => Promise<ActionRunResult>;

type WaitForActionResultOptions = {
  sleep?: typeof defaultSleep;
  now?: () => number;
};

export async function waitForActionResult<TAction extends ActionManifestDescriptor>(
  action: TAction,
  initialResult: ActionRunResult,
  onProgress: (result: ActionRunResult) => void,
  pollActionStatus: PollStatus<TAction>,
  signal?: AbortSignal,
  options: WaitForActionResultOptions = {},
): Promise<ActionRunResult> {
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  let result = initialResult;
  let statusRoute = readStatusRoute(result);

  if (!shouldStartPolling(action, result, statusRoute)) return result;

  const timeoutMs = pollTimeoutMs(action);
  const startedAt = now();
  let pollAtLeastOnce = action.resultMode === "emdash-action-accepted-v1";

  while (statusRoute && (pollAtLeastOnce || shouldContinuePolling(result))) {
    throwIfAborted(signal);
    onProgress(result);
    const elapsed = now() - startedAt;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `${localizedString(action.label, undefined, action.id)} is still running. Check the provider job status.`,
      );
    }

    // Clamp the poll delay to the remaining timeout budget so a short
    // pollTimeoutMs is not overrun by a whole poll interval before the
    // timeout is enforced on the next iteration.
    await sleep(Math.min(pollDelayMs(action, result), timeoutMs - elapsed), signal);
    result = await pollActionStatus(action, statusRoute, signal);
    statusRoute = readStatusRoute(result) ?? statusRoute;
    pollAtLeastOnce = false;
  }

  return result;
}

export function normalizePollResult(
  action: Pick<ActionManifestDescriptor, "resultEffect">,
  statusRoute: string,
  value: unknown,
): ActionRunResult {
  // A bare-string status-poll body is progress text, not a terminal envelope.
  // `normalizeActionRunResult` would turn it into `{ ok: true, status: 200 }`
  // (no jobStatus), which `shouldContinuePolling` reads as terminal success and
  // ends the loop while the job is still running. Keep it polling instead by
  // emitting status 202 and preserving the status route. Providers signal
  // completion with a JSON envelope (jobStatus / status 200), not a plain
  // string.
  if (typeof value === "string") {
    return { ok: true, status: 202, statusRoute, message: value };
  }
  return normalizeActionRunResult(action, value);
}

export function shouldStartPolling(
  action: ActionManifestDescriptor,
  result: ActionRunResult,
  statusRoute: string | null,
) {
  if (!statusRoute) return false;
  if (shouldContinuePolling(result)) return true;
  return action.resultMode === "emdash-action-accepted-v1" && !isTerminalJobResult(result);
}

export function shouldContinuePolling(result: ActionRunResult) {
  if (result.ok === false) return false;
  const jobStatus = readJobStatus(result);
  if (jobStatus) return PENDING_JOB_STATUSES.has(jobStatus);
  return result.status === 202;
}

export function isTerminalJobResult(result: ActionRunResult) {
  const jobStatus = readJobStatus(result);
  if (jobStatus) {
    return jobStatus === "succeeded" || FAILED_JOB_STATUSES.has(jobStatus);
  }
  return result.ok === false || (typeof result.status === "number" && result.status !== 202);
}

export function readStatusRoute(result: ActionRunResult) {
  if (!result.statusRoute) return null;
  return normalizePluginRoute(result.statusRoute);
}

export function readJobStatus(result: ActionRunResult) {
  return typeof result.jobStatus === "string" ? result.jobStatus.trim().toLowerCase() : null;
}

export function pollDelayMs(action: ActionManifestDescriptor, result: ActionRunResult) {
  return clampPollMs(
    numberOrNull(result.pollAfterMs) ??
      numberOrNull(action.pollIntervalMs) ??
      DEFAULT_POLL_INTERVAL_MS,
  );
}

export function pollTimeoutMs(action: ActionManifestDescriptor) {
  return Math.min(
    MAX_POLL_TIMEOUT_MS,
    Math.max(MIN_POLL_INTERVAL_MS, numberOrNull(action.pollTimeoutMs) ?? DEFAULT_POLL_TIMEOUT_MS),
  );
}

export function clampPollMs(value: number) {
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, value));
}

export function resultPhase(result: ActionRunResult): "progress" | "success" | "error" {
  if (isErrorResult(result)) return "error";
  if (shouldContinuePolling(result)) return "progress";
  return "success";
}

export function isErrorResult(result: ActionRunResult) {
  if (isConflictReloadResult(result)) return false;
  const jobStatus = readJobStatus(result);
  if (jobStatus && FAILED_JOB_STATUSES.has(jobStatus)) return true;
  if (result.ok === false) return true;
  return typeof result.status === "number" && result.status >= 400;
}

export function isSuccessfulTerminalResult(result: ActionRunResult) {
  if (isErrorResult(result)) return false;
  if (shouldContinuePolling(result)) return false;
  // A terminally-succeeded job is a success even if the provider kept HTTP 202
  // on the final poll body; otherwise widgets would skip effects and patches.
  if (readJobStatus(result) === "succeeded") return true;
  return result.status !== 202;
}

export function resultToneStatus(result: ActionRunResult) {
  const jobStatus = readJobStatus(result);
  if (jobStatus && FAILED_JOB_STATUSES.has(jobStatus)) return "error";
  if (jobStatus && PENDING_JOB_STATUSES.has(jobStatus)) return "info";
  if (result.ok === false) return "error";
  return null;
}

export function isConflictReloadResult(result: ActionRunResult) {
  return result.status === 409 && result.severity === "warning" && hasReloadEffect(result);
}

function hasReloadEffect(result: ActionRunResult) {
  return result.reload !== undefined || asRecord(result.effects)?.reload !== undefined;
}
