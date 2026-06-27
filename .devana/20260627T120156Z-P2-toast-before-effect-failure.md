DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | high | security=no
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

DEVANA-KEY: src/admin.tsx:504 | toast-before-effect-failure
DEVANA-SUMMARY: open | P2 | high | showActionToasts runs before runActionEffects, so a success toast can remain visible when a subsequent effect failure sets error button feedback.