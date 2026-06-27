DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | high | security=no
DEVANA-KEY: src/admin.tsx:385 | dashboard-stale-run-targettype

# Dashboard targetType change does not abort in-flight action runs

## Finding

When host `context` changes and `targetType` updates, the dashboard widget reloads provider manifests but does not abort active `runAbortControllers`. A long-running dashboard action started under one surface filter can complete after the widget has switched to entry-filtered actions and still run `runActionEffects` with the stale closure action.

## Violated Invariant Or Contract

An async dashboard run that no longer matches the widget’s current surface filter must not apply result effects or patches after the surface context changes.

## Oracle

Load effect aborts only its manifest `AbortController` on `targetType` change (`admin.tsx` ~364–385). Unmount cleanup aborts run controllers (~387–397), but `targetType` changes without unmount are unguarded. Field analogue reported as `stale-run-after-context-change`.

## Counterexample

1. Dashboard widget mounts with `context` undefined → `targetType === "dashboard"`.
2. User starts a long-running dashboard action.
3. Host updates `context` to `{ surface: "entry", collection: "posts", entryId: "post-1" }` → `targetType` becomes `"entry"`.
4. `useEffect([targetType])` refetches and replaces `state.actions` with entry-filtered actions; the active run’s `AbortController` is not aborted.
5. Original run completes; `await runActionEffects(action, finalResult)` runs with the stale closure `action`.

## Why It Might Matter

Reload, download, clipboard, and open effects from a dashboard-scoped action can fire after the widget has switched to entry-scoped actions.

## Proof

Dependency-change trace: `targetType` change → `loadProviderActions` → no `runAbortControllers` abort → successful `waitForActionResult` → unconditional `runActionEffects` at `admin.tsx` ~507.

## Counterevidence Checked

`isActionBusy` prevents overlapping clicks on the same action key during a run. `applyActionUpdate` no-ops when `state.status !== "ready"`, but effects are not gated on state status. Excluded `stale-run-after-context-change` covers the field widget value/options path, not dashboard `targetType` transitions.

## Suggested Next Step

Abort all `runAbortControllers` when `targetType` changes, or generation-guard completion handlers so effects run only if the starting `targetType` still matches.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Dashboard analogue of stale-run-after-context-change. Confirmed the dashboard load effect aborted only its manifest controller on `targetType` change, leaving in-flight `runAbortControllers` active to complete and run effects/patches against a stale closure action after the surface filter switched. Added a dedicated effect with deps `[targetType]` whose cleanup aborts every entry in `runAbortControllers.current`. Aborted runs bail via the centralized guard in waitForActionResult (poll-terminal-ignores-abort); their `finally` still clears busy state (the `busyKeysRef` reset is unconditional, and the controller-dict delete is gated so it won't drop a newer run's controller). No clearing of the dict in the new effect — aborting alone avoids any interplay with the finally's gate. Typecheck + full suite (51 tests) pass.

DEVANA-KEY: src/admin.tsx:385 | dashboard-stale-run-targettype
DEVANA-SUMMARY: fixed | P2 | high | A targetType-change effect now aborts in-flight dashboard run controllers, so a run started under a prior surface filter bails instead of applying effects/patches after the widget switches surfaces.