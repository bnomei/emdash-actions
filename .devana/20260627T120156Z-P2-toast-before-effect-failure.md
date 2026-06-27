DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | high | security=no
DEVANA-KEY: src/admin.tsx:504 | toast-before-effect-failure

# Success toast shown before effects; effect failure leaves contradictory UI

## Finding

On a terminal success result, `showActionToasts(finalResult)` runs before `await runActionEffects(...)`. If an effect throws (clipboard denied, download 404, invalid open URL), the `catch` path sets error button feedback but does not retract the success toast already shown.

## Violated Invariant Or Contract

Terminal UX for a single click should present a coherent outcome across toast and button feedback surfaces.

## Oracle

Success handler ordering in `runAction` (`admin.tsx` ~504–507) and `runFieldAction` (~958–962); `catch` blocks (~536–543, ~992–999) only update button feedback on effect failure.

## Counterexample

Provider returns `{ ok: true, status: 200, toast: { type: "success", title: "Done" }, effects: { download: { route: "missing" } } }`. `showActionToasts` renders the success toast. `runDownloadEffect` throws on 404. Button shows error feedback; toast remains visible.

## Why It Might Matter

Users see simultaneous success toast and error button state, undermining trust in action feedback especially for download/clipboard/open-heavy workflows.

## Proof

Dataflow trace: `showActionToasts(finalResult)` → `await runActionEffects` throws → `catch` sets error feedback; toast manager is never updated.

## Counterevidence Checked

Excluded `effect-failure-aborts-remaining` covers skipped subsequent effects and error conversion within the effect chain, not toast/button divergence. Excluded `result-patch-throw-skips-effects` covers patch validation throws before effects. Success button feedback is set only after effects complete (~511–520), so the clash is primarily toast vs button.

## Suggested Next Step

Move `showActionToasts` after successful `runActionEffects`, or remove/replace toasts in the `catch` path when effects fail after a terminal success result.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Two layers. (1) The primary reported path — an effect throwing into the catch and setting error button feedback beside the success toast — was already closed earlier this session by effect-failure-aborts-remaining: `runActionEffects` now isolates each effect and never rejects on an individual failure, so a download 404 / clipboard-denied no longer reaches the catch. (2) For the residual case (e.g. a throwing host `onChange` in `applyFieldResultValue`, or any future throwing success step), implemented the report's suggested ordering: moved `showActionToasts(finalResult)` to AFTER the success sequence (patch → writeback → `runActionEffects`) in both `runAction` (dashboard) and `runFieldAction` (field). Kept a `showActionToasts` call in each non-success branch so error/info result toasts still render. Now a failure before the toast call routes to the catch with no success toast shown — toast and button feedback stay coherent. Typecheck + full suite (51 tests) pass.

DEVANA-KEY: src/admin.tsx:504 | toast-before-effect-failure
DEVANA-SUMMARY: fixed | P2 | high | showActionToasts now runs after the success sequence commits (and runActionEffects no longer throws), so a success toast can no longer remain beside error button feedback; non-success branches still show their result toasts.