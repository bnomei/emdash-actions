DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | high | security=no
DEVANA-KEY: src/admin.tsx:904 | field-double-submit-no-guard

# Field run button lacks synchronous in-flight guard

## Finding

Dashboard actions use a synchronous `isActionBusy(busyKeysRef.current, action.key)` check before the first `await`. Field `runFieldAction` only calls `setBusy(true)` and relies on `disabled={busy}`, which updates on the next React render. A second click in the same event-loop turn can start a overlapping HTTP request before the button becomes disabled.

## Violated Invariant Or Contract

At most one in-flight invocation per field button click sequence; the field surface should match the dashboard busy-key semantics.

## Oracle

`ActionsWidgetContent.runAction` (`admin.tsx` ~467–473) vs `ActionButtonFieldContent.runFieldAction` (`admin.tsx` ~904–926); `busy-state.ts` helpers used only on the dashboard path.

## Counterexample

1. User double-clicks a field run button (no blocking `confirm`, typical direct/runner action).
2. First click enters `runFieldAction`, sets `setBusy(true)` (scheduled), starts `await callAction`.
3. Second click runs before re-render; `busy` is still `false`, `disabled` is still `false`.
4. Second click aborts the first controller and starts a second `callAction`.
5. If the first request completes after abort (see `poll-terminal-ignores-abort`), stale success handling can still commit.

## Why It Might Matter

Duplicate provider invocations for non-idempotent actions (publish, delete, charge) and race-driven stale UI updates on field buttons.

## Proof

Entry `ActionButtonField` click → `runFieldAction` → no sync busy guard → yield at `await callAction` → second click enters with `busy === false` → second `apiFetch`. Dashboard path blocks the second click synchronously via `busyKeysRef`.

## Counterevidence Checked

`finally` only clears `busy` when `runAbortController.current === controller`, masking overlap in UI. Kumo `Button` `loading={busy}` may block repeat clicks after first paint, but the guard gap between first click and re-render remains in source. `busy-state.test.mjs` covers dashboard keys only.

## Suggested Next Step

Add a ref-based in-flight guard to `runFieldAction` matching the dashboard `busyKeysRef` pattern, or check `runAbortController.current` before starting a new run.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin.tsx:904 | field-double-submit-no-guard
DEVANA-SUMMARY: open | P2 | high | Field runFieldAction has no synchronous busy guard before the first await, so a double-click can issue overlapping provider requests unlike the dashboard widget.