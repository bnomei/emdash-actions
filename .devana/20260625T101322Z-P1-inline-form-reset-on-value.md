DEVANA-FINDING: v1
Priority: P1 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/admin.tsx:845 | Slug: inline-form-reset-on-value

# Inline form input is discarded when the host field value changes

## Finding

`ActionButtonFieldContent` reloads the resolved action whenever `value` changes and unconditionally calls `setFormValues(actionFormInitialValues(...))`. User edits to inline form fields are wiped on every keystroke in the bound host field.

## Violated Invariant Or Contract

Inline `form.mode: "inline"` fields are meant to collect user input before submit. That input should persist until the user submits or the action identity changes, not reset when the host field value changes.

## Oracle

`examples/inline-form-action.md` and `examples/runner-field-action.md` describe inline forms whose values are merged into the payload at submit time; README states user-provided form values win over defaults.

## Counterexample

1. Mount a manifest-backed field action with an inline `format` select (`examples/runner-field-action.md`).
2. User selects `"long"` in the inline form.
3. User types in the host field, updating the `value` prop on each keystroke.
4. The load `useEffect` (`deps: [label, options, targetType, value]`) reruns and executes `setFormValues(actionFormInitialValues(resolved.form, resolved.payload))`.
5. The inline form reverts to defaults; `"long"` is lost before submit.

## Why It Might Matter

Users cannot combine inline form input with normal field editing. Submissions silently fall back to default form values, causing wrong provider behavior.

## Proof

**Control-flow trace:** `value` change → `useEffect` (`admin.tsx:819-860`) → `resolveFieldAction` → `setFormValues(actionFormInitialValues(...))` at line 845 on every successful load, with no guard that only `value` changed and no merge with existing `formValues`.

## Counterevidence Checked

- Dashboard widget keeps `formValuesByKey` across unrelated state because its loader depends only on `targetType`.
- `busy` does not block parent `value` updates.
- No code path preserves prior `formValues` when `value` is the only dependency change.

## Suggested Next Step

Remove `value` from the reload dependency array and refresh `valueKey`/payload at submit time instead, or skip `setFormValues` when only `value` changed and the resolved action id/provider are unchanged.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed the load effect listed `value` in its deps and unconditionally re-ran `setFormValues(actionFormInitialValues(...))`, wiping inline form input on each host-field keystroke. Removed `value` from the dep array; `targetType` (the only `value`-derived dep) is `.type`, which does not vary with `value`, so the descriptor still reloads on identity changes. The live field value is re-merged into the payload at submit time (see valuekey-stale-payload), so dropping it from the reload deps loses no correctness. Typecheck + full suite (38 tests) pass.

DEVANA-KEY: src/admin.tsx:845 | P1 | inline-form-reset-on-value
DEVANA-SUMMARY: Status=fixed | P1 high src/admin.tsx:845 - Load effect no longer depends on `value`, so inline form input persists across host-field edits; the live value is re-merged at submit time instead.