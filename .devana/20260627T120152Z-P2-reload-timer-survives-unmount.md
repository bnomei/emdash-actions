DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | high | security=no
DEVANA-KEY: src/admin-effects.ts:328 | reload-timer-survives-unmount

# Scheduled reload timers are not cancelled on widget unmount

## Finding

`scheduleReload` uses a bare `globalThis.setTimeout` with no stored handle and no teardown hook. Widget cleanup aborts fetch controllers and feedback timers but never clears pending reload timers. A successful action can still dispatch `emdash-actions:reload` or call `location.reload()` after the button widget unmounts.

## Violated Invariant Or Contract

Lifecycle-owned UI surfaces should not schedule page-level side effects after the surface that initiated them has unmounted, unless explicitly documented as intentional.

## Oracle

Unmount cleanup in `ActionButtonFieldContent` (`admin.tsx` ~862–870) clears feedback timers and aborts `runAbortController` but does not interact with `scheduleReload`. `scheduleReload` implementation in `admin-effects.ts`.

## Counterexample

1. Action succeeds with `effects.reload: { delayMs: 2000 }`.
2. `runActionEffects` calls `scheduleReload`, registering a timer.
3. User navigates away; field widget unmounts at T+500ms (abort runs, feedback timer cleared).
4. At T+2000ms the timer fires unconditionally and may reload the page on a different admin route.

## Why It Might Matter

Unexpected full-page reloads after navigation, or reload events firing for actions the user already left behind. Combines with post-abort success commits when a terminal result schedules reload after unmount.

## Proof

State trace: `runActionEffects` → `setTimeout` (no id, no cleanup) → widget unmount → timer callback runs → `dispatchReloadEvent` / `location.reload()`.

## Counterevidence Checked

`dispatchReloadEvent` is cancelable; a host handler returning `false` skips `location.reload()` but the timer still runs. Delay is clamped to ≤60s via `clampFeedbackMs`. Deferred reload may be desirable in some flows, but no source comment documents intentional post-unmount behavior.

## Suggested Next Step

Return timer ids from `scheduleReload` (or accept an `AbortSignal`) and clear them in widget unmount cleanup alongside feedback timers.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `scheduleReload` used a bare `setTimeout` with no handle/teardown, and neither widget's unmount cleanup touched it, so a deferred reload could `dispatchReloadEvent`/`location.reload()` after the initiating widget unmounted. Made `scheduleReload` accept an optional `AbortSignal`: returns early if already aborted, stores the timer id, and registers an `abort` listener that clears it (the timer callback removes the listener when it fires). Threaded a widget-lifetime `AbortController` (lazy `??=` init, aborted in each widget's existing unmount cleanup) through `runActionEffects` via a new `reloadSignal` dependency to the reload call, for both the dashboard and field widgets. Updated the deps type and the existing injected-handler test (scheduleReload now receives a 3rd `signal` arg, `undefined` there). Added a test: an aborting lifetime signal cancels the pending reload (no dispatch/reload), and a pre-aborted signal is a no-op. Typecheck + full suite (50 tests) pass.

DEVANA-KEY: src/admin-effects.ts:328 | reload-timer-survives-unmount
DEVANA-SUMMARY: fixed | P2 | high | scheduleReload now takes a widget-lifetime AbortSignal that cancels its timer on unmount, so a deferred reload can no longer fire after the initiating action widget has unmounted.