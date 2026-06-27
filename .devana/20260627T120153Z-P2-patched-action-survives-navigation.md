DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | high | security=no
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
- 2026-06-27: fixed. Confirmed the load effect deps lacked entry identity, so a result-patched descriptor (label/confirm/tone/disabled/payload) persisted across client navigation to a different entry. (Note: this was latent but surfaced/worsened by inline-form-reset-on-value, which removed `value` from those deps.) Added a derived `entryKey` = collection + entryId + entryLocale (from `context` or `readEntryContextRoute()`) and included it in the load-effect deps, so navigating to a different entry reloads the manifest and replaces the patched descriptor with the new entry's defaults, while in-entry value edits (same entryKey) still don't reload — preserving the inline-form fix. Also added `entryKey` to the run-abort effect so an in-flight run on the prior entry is superseded on navigation. Imported `readEntryContextRoute` (already exported). Typecheck + full suite (50 tests) pass.

DEVANA-KEY: src/admin.tsx:819 | patched-action-survives-navigation
DEVANA-SUMMARY: fixed | P2 | high | The field load effect now depends on an entryKey (collection/entryId/locale), so a result-patched descriptor is reset on entry navigation instead of persisting onto a different entry; in-entry value edits still don't reload.