DEVANA-FINDING: v1
Priority: P1 | Confidence: high | Security-sensitive: no | Status: open
Location: src/admin-effects.ts:121 | Slug: result-patch-throw-skips-effects

# Invalid action patch throws after success, skipping effects and field writeback

## Finding

After an action run reaches a successful terminal result, both the dashboard and
field success branches call `actionPatchFromResult` (directly via `applyActionUpdate`
at `src/admin.tsx:429`, and via `mergeActionResultPatch` at `src/admin.tsx:960`).
`actionPatchFromResult` validates patch fields with throwing readers
(`readRequiredLocalizedString(patch.label, ...)` at `src/admin-effects.ts:121`,
plus `readNullableString`/`readNullableTone` for icon/tone). If the server result's
`action` patch carries an invalid value, the throw escapes the success branch
*after* `showActionToasts` has already fired and *before* `runActionEffects`
(and, in field mode, `applyFieldResultValue`) runs.

## Violated Invariant Or Contract

Once `isSuccessfulTerminalResult(finalResult)` is true, the committed success
sequence must complete: apply patch -> run effects -> (field) write result value ->
show success feedback. A malformed optional patch field must not abort that
sequence, because the run already succeeded server-side and a success toast was
already shown.

## Oracle

The success-branch ordering in `runAction` (admin.tsx:505-521) and `runFieldAction`
(admin.tsx:959-977): `showActionToasts(finalResult, i18n)` executes at admin.tsx:504/958,
then patch application, then `runActionEffects`, then (field) `applyFieldResultValue`.
These later steps are unconditional within the branch and clearly intended to run on success.

## Counterexample

Server returns a successful runner/direct result whose body includes
`action: { label: "" }` (also reproduces with `label: "   "`, `label: {}`,
`label: null`, or a wrong-typed `icon`/`tone`). `normalizeActionRunResult`
(admin-effects.ts:53) returns the record verbatim; `isSuccessfulTerminalResult` is
true; `actionPatchFromResult` reaches `readRequiredLocalizedString("")` and throws
`Action action.label is required`.

## Why It Might Matter

The user sees a success toast immediately followed by a red error banner showing an
internal validation message (`Action action.label is required`), while
clipboard/open/download/reload effects are silently skipped and, in field mode, the
`resultValueKey` writeback into the field is lost. The action looks half-applied
with a misleading error.

## Proof

Control-flow trace, dashboard: admin.tsx:483 normalize -> 494 waitForActionResult ->
504 toasts (executed) -> 505 success branch -> 506 `applyActionUpdate` -> admin.tsx:429
`actionPatchFromResult` -> admin-effects.ts:120-121 throw -> caught at admin.tsx:536.
`runActionEffects` at 507 never runs. Field path: admin.tsx:960 `mergeActionResultPatch`
-> throw lands before `runActionEffects` (962) and `applyFieldResultValue` (963),
caught at admin.tsx:992.

## Counterevidence Checked

Neither call site wraps the patch parse in its own try/catch (admin.tsx:428-442 and
959-963 sit only inside the outer run try). `normalizeActionRunResult` returns server
records as-is and never validates `result.action`; `waitForActionResult` never reads
`result.action`, so nothing strips or validates the bad patch earlier. The outer catch
replaces feedback with the thrown message unless it is an AbortError (admin.tsx:537/993).
`finally` clears busy state correctly, so the only damage is skipped effects/writeback
plus the misleading banner.

## Suggested Next Step

Parse the patch (`actionPatchFromResult`/`mergeActionResultPatch`) inside its own
try/catch in both success branches, or make the patch readers non-throwing (drop the
invalid field and keep the prior value) so effects and field writeback still run on a
successful result.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin-effects.ts:121 | P1 | result-patch-throw-skips-effects
DEVANA-SUMMARY: Status=open | P1 high src/admin-effects.ts:121 - An invalid action patch field (e.g. empty label) in a successful result throws inside actionPatchFromResult, skipping effects and field writeback and surfacing an internal validation error after the success toast.
