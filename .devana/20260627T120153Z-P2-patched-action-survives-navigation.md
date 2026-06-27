DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | high | security=no
DEVANA-KEY: src/admin.tsx:819 | patched-action-survives-navigation

# Result-patched field action descriptor survives entry navigation

## Finding

After a successful run patches the field action descriptor via `mergeActionResultPatch`, the patched label, confirm text, tone, disabled flag, and payload persist in React state. The manifest reload effect depends on `[label, options, targetType, value]` only, not the admin route entry id. Client-side navigation to a different entry without changing those deps does not refetch the manifest or reset the patch.

## Violated Invariant Or Contract

After navigating to a different entry, the visible action descriptor should reflect the current entry’s manifest defaults, not the last successful run on a prior entry.

## Oracle

Field load `useEffect` deps (`admin.tsx` ~860); success path `setAction(mergeActionResultPatch(...))` (~960–961); `readEntryContextRoute` reads entry id from URL but is not a load dependency.

## Counterexample

1. User is on entry A with a toggle action that patches `label` and `confirm` on success.
2. Run succeeds; `setAction` stores the patched descriptor.
3. User client-navigates to entry B; `value`, `options`, `label`, and `targetType` are unchanged.
4. Load effect does not rerun; button still shows entry A’s patched label/confirm.
5. Next run resolves fresh target context from the new URL but the UI descriptor remains stale.

## Why It Might Matter

Wrong confirm prompts and labels on the wrong entry; patched `payload` defaults diverge from the provider manifest for the new entry.

## Proof

Control-flow trace: success patch → `setAction` → navigation changes URL entry id only → load deps unchanged → no manifest reload → render uses patched `action` state.

## Counterevidence Checked

Load effect resets on `value` change (~845). Full page reload or `scheduleReload` would clear state. Excluded `stale-run-after-context-change` covers stale invocation completion when host `context` is provided, not persisted patched UI state across entry navigation.

## Suggested Next Step

Include entry identity (from `readEntryContextRoute` or `context.entryId`) in the load effect dependencies, or reset patched action state when the route entry id changes.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin.tsx:819 | patched-action-survives-navigation
DEVANA-SUMMARY: open | P2 | high | mergeActionResultPatch state persists across entry navigation because the field load effect does not depend on route entry id.