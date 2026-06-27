DEVANA-FINDING: v1
DEVANA-STATE: open | P1 | high | security=no
DEVANA-KEY: src/admin-polling.ts:45 | poll-terminal-ignores-abort

# Terminal poll result returned after abort still commits success handling

## Finding

`waitForActionResult` checks `signal.aborted` only at the start of each poll iteration and during `sleep`/fetch. After a status poll returns a terminal body, the loop exits and returns the result without a final abort check. A superseded or unmounted run can still apply patches, run effects, write field values, and show success toasts.

## Violated Invariant Or Contract

Once `AbortController.abort()` runs for a run, that invocation must not commit terminal success side effects (state updates, `onChange`, `runActionEffects`, toasts).

## Oracle

Abort handling in `src/admin-cancellation.ts` (`throwIfAborted`, `isAbortError`); run handlers in `src/admin.tsx` swallow `AbortError` in `catch` but only when an error is thrown on the success path.

## Counterexample

1. Field action starts polling with `controller.signal`.
2. User triggers a superseding run or navigates away; `controller.abort()` fires.
3. An in-flight status poll still resolves with `{ jobStatus: "succeeded" }`.
4. `shouldContinuePolling` is false; the `while` loop exits without calling `throwIfAborted`.
5. `waitForActionResult` returns the succeeded result.
6. `runFieldAction` calls `showActionToasts`, `mergeActionResultPatch`, `runActionEffects`, and `applyFieldResultValue` despite the aborted signal.

## Why It Might Matter

Stale completions can patch the wrong button state, write results into a field after the user moved on, or schedule reloads after unmount. This amplifies the field double-submit race where the first aborted controller can still win.

## Proof

Event-order trace: `pollActionStatus` resolves terminal body → `abort()` (supersede/unmount) → loop exits without `throwIfAborted` → `return result` → `isSuccessfulTerminalResult` true → success handlers in `admin.tsx` run.

## Counterevidence Checked

Abort during `sleep` rejects via `admin-cancellation.ts`. Abort during an in-flight fetch can throw before the handler sees a body. The gap is specifically after a parsed terminal poll response is assigned and before return. Excluded `stale-run-after-context-change` covers missing generation guards on value/options change, not post-poll abort omission.

## Suggested Next Step

Call `throwIfAborted(signal)` immediately before returning from `waitForActionResult`, and add the same guard between `callAction` and `waitForActionResult` on the non-polling fast path.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin-polling.ts:45 | poll-terminal-ignores-abort
DEVANA-SUMMARY: open | P1 | high | waitForActionResult returns a terminal poll success without a final abort check, so superseded or unmounted runs can still apply patches, effects, and field writeback.