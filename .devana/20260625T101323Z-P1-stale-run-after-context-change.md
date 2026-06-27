DEVANA-FINDING: v1
Priority: P1 | Confidence: high | Security-sensitive: no | Status: open
Location: src/admin.tsx:959 | Slug: stale-run-after-context-change

# In-flight field runs can commit results after context or value changes

## Finding

When `value`, `options`, `label`, or `targetType` change during an async field action run, the load `useEffect` updates widget state but does not abort `runAbortController` or guard run completion. A finishing run can still patch the action descriptor, write `resultValueKey` back through `onChange`, and run result effects against stale context.

## Violated Invariant Or Contract

Async completion handlers should only mutate widget and field state when the run still matches the current field value, options, and resolved action generation.

## Oracle

Load-effect cleanup aborts only the manifest-load controller (`admin.tsx:856-858`), while run lifecycle uses a separate `runAbortController` cleared only on unmount or explicit re-click. Re-click supersession is blocked because the button is `disabled` while `busy`, so the reachable path is dependency change without a second click.

## Counterexample

1. User starts a long-running field action at `value = "A"`.
2. While the request is in flight, `value` changes to `"B"` (or `options.mode` switches to `"clipboard"`).
3. Load effect resolves a new action for `"B"` / clears `action` for clipboard, but the in-flight run is not aborted.
4. The original run completes and executes `setAction(patchedAction)`, `applyFieldResultValue(..., onChange)`, and `runActionEffects`.
5. The widget can show action metadata or field values from the `"A"` run while bound to `"B"`, or resurrect `action` during clipboard mode.

## Why It Might Matter

Wrong field writebacks, stale toggled button labels, and unintended reload/download/clipboard effects can apply after the user has already moved to new content or mode.

## Proof

**State transition mismatch:** dependency change triggers load reset (`setAction`, `setMode`, etc.) without aborting the active run controller; completion path (`admin.tsx:959-963`) has no generation check and no `throwIfAborted` after `waitForActionResult` returns.

## Counterevidence Checked

- Field button `disabled` includes `busy`, preventing supersession via double-click during a run.
- Load `active` flag prevents stale manifest `setState` only; it does not cover `runFieldAction` completion.
- Unmount cleanup aborts the run controller, but value/mode changes without unmount are unguarded.

## Suggested Next Step

Abort `runAbortController` in the load-effect cleanup (and on dependency change), and/or tag each run with a generation token checked before applying patches, effects, and `onChange` writebacks.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin.tsx:959 | P1 | stale-run-after-context-change
DEVANA-SUMMARY: Status=open | P1 high src/admin.tsx:959 - Field action runs are not cancelled or generation-guarded when value/options change, so stale completions can patch state and write results into the wrong field.