DEVANA-FINDING: v1
DEVANA-STATE: fixed | P1 | high | security=no
DEVANA-KEY: src/admin-polling.ts:73 | noncanonical-jobstatus-stops-poll

# Non-canonical jobStatus stops polling in a non-terminal state

## Finding

When a status poll returns a `jobStatus` string that is not in the canonical pending set (`accepted`, `queued`, `running`), `shouldContinuePolling` returns false even though the job is not in a documented terminal state (`succeeded`, `failed`, `cancelled`). Polling halts in limbo: with `status: 200` the client treats the job as successfully complete; with `status: 202` the button shows a running state but never polls again.

## Violated Invariant Or Contract

`examples/async-job.md` documents that polling continues until `jobStatus` is `succeeded`, `failed`, or `cancelled`, and that pending statuses are only `accepted`, `queued`, and `running`.

## Oracle

`examples/async-job.md` lines 133–136; `shouldContinuePolling` and `isTerminalJobResult` in `src/admin-polling.ts`.

## Counterexample

Status poll returns `{ ok: true, status: 200, jobStatus: "processing", statusRoute: "jobs/export-status" }`. `readJobStatus` → `"processing"`; `shouldContinuePolling` → false; `isTerminalJobResult` → false; `isSuccessfulTerminalResult` → true because `status !== 202`. The widget runs success effects, patches, and writeback while the provider job is still in progress.

With `status: 202` and the same `jobStatus`, polling stops and `isSuccessfulTerminalResult` is false, leaving the button in a perpetual “still running” state with no further status fetches.

## Why It Might Matter

Providers that emit common in-progress labels (`processing`, `pending`, `in_progress`) cause either premature success handling or a stuck progress UI. Export and long-running job buttons become unreliable without any timeout recovery on the stuck path.

## Proof

Poll-state transition: `accepted` (continues) → `processing` (stops) without reaching `succeeded`/`failed`/`cancelled`. `shouldContinuePolling` only treats the three pending strings as in-flight; any other non-empty `jobStatus` ends the loop without terminal classification.

## Counterevidence Checked

Canonical providers using only `accepted` → `running` → `succeeded` are unaffected. `test/admin-polling.test.ts` exercises only canonical statuses. Excluded finding `succeeded-202-skips-effects` covers `jobStatus: "succeeded"` with `status: 202`, not unknown in-progress strings.

## Suggested Next Step

Treat unrecognized `jobStatus` values as pending when `statusRoute` is still present and `status` is 202, or document and reject non-canonical values explicitly at normalization time.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `shouldContinuePolling` only continued for the three canonical pending strings, so a non-canonical in-progress `jobStatus` like "processing" stopped the loop (false success at 200; stuck UI at 202). Aligned with the documented oracle (examples/async-job.md: poll until succeeded/failed/cancelled): `shouldContinuePolling` now continues for any non-terminal jobStatus via a new exported `isTerminalJobStatus` helper (succeeded + failed/cancelled), which `isTerminalJobResult` also reuses. The unknown status keeps polling until a terminal state or the poll timeout, so no premature success and no permanent stall. `resultToneStatus`'s canonical PENDING set is unchanged (display nuance only). Added tests: "processing"/"in_progress" continue polling and are not classified as success/error. Typecheck + polling tests (7) pass.

DEVANA-KEY: src/admin-polling.ts:73 | noncanonical-jobstatus-stops-poll
DEVANA-SUMMARY: fixed | P1 | high | shouldContinuePolling now treats any non-terminal jobStatus (incl. non-canonical labels like "processing") as pending, so polling continues to a terminal state instead of false success at 200 or a stuck UI at 202.