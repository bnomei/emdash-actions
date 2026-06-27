DEVANA-FINDING: v1
Priority: P2 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/admin-polling.ts:45 | Slug: poll-timeout-before-sleep

# `pollTimeoutMs` can be exceeded by a full poll delay before timeout is enforced

## Finding

`waitForActionResult` checks the timeout budget before each `sleep(pollDelayMs(...))` call. On the first loop iteration, it always sleeps the full poll delay even when `pollTimeoutMs` is smaller than that delay.

## Violated Invariant Or Contract

`pollTimeoutMs` is configured as the async polling timeout in README and `examples/async-job.md`. Elapsed wall time should not exceed that budget by roughly a whole poll interval.

## Oracle

`test/admin-polling.test.ts` asserts timeout throws with `pollTimeoutMs: 250` but does not assert elapsed time. Source order is timeout check, then `sleep(pollDelayMs)`, where `pollDelayMs` floors to at least 250ms and defaults to 1500ms.

## Counterexample

Action with `pollTimeoutMs: 250`, initial result `{ ok: true, status: 202, statusRoute: "jobs/1" }`, fake clock starting at `1000`:

1. First loop: timeout check sees `0 > 250` → false.
2. `sleep(1500)` runs.
3. Second loop: elapsed `1500 > 250` → timeout throws.

The user waits ~1500ms for a 250ms timeout.

## Why It Might Matter

Short timeouts intended for tests or fast-fail UX silently wait for the default 1.5s poll interval, delaying error feedback and keeping buttons in a running state longer than configured.

## Proof

**Control-flow trace:** `waitForActionResult` loop (`admin-polling.ts:45-57`) orders `onProgress` → timeout check → `sleep(pollDelayMs)` → poll. `pollDelayMs` minimum is `MIN_POLL_INTERVAL_MS` (250) while `pollTimeoutMs` can also be 250.

## Counterevidence Checked

- `pollTimeoutMs` floors at `MIN_POLL_INTERVAL_MS`, which aligns numerically with minimum delay but does not fix ordering.
- Timeout eventually throws on the second iteration; the bug is late enforcement, not absent enforcement.
- `clampPollMs` behavior is intentional for delay bounds.

## Suggested Next Step

Check timeout after sleeping, clamp the first sleep to the remaining budget, or compare `startedAt + timeoutMs` against `now() + pollDelayMs` before sleeping.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed the loop slept the full `pollDelayMs` (>=250ms, default 1500ms) before re-checking the timeout, overrunning a short `pollTimeoutMs` by up to a whole interval. Now clamp the sleep to `timeoutMs - elapsed`. Changed the timeout comparison from `>` to `>=` because clamping alone with strict `>` busy-loops at the deadline (remaining budget 0 → sleep 0 → re-poll). Verified both existing tests still hold: the accepted-at-least-once test still sleeps the full 1500ms (budget 120000), and the timeout test still polls exactly once. Added a regression test asserting the first sleep is clamped to 250ms (not 1500ms) and the timeout fires after one poll. Typecheck + polling tests pass.

DEVANA-KEY: src/admin-polling.ts:45 | P2 | poll-timeout-before-sleep
DEVANA-SUMMARY: Status=fixed | P2 high src/admin-polling.ts:45 - Poll sleep is clamped to the remaining timeout budget, so a short pollTimeoutMs is enforced within its budget instead of after a full poll interval.