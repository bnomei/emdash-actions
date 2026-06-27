DEVANA-FINDING: v1
DEVANA-STATE: fixed | P2 | high | security=no
DEVANA-KEY: src/admin.tsx:428 | form-stale-after-payload-patch

# Inline form values not reconciled after result.action.payload patch

## Finding

When a successful result patches `action.payload` via `mergeActionResultPatch` / `applyActionUpdate`, the inline form value store (`formValues` on fields, `formValuesByKey` on dashboard) is not updated or invalidated. Subsequent submits build the request body from stale form state, and user-edited values continue to win over the patched defaults.

## Violated Invariant Or Contract

After a successful run patches `action.payload`, the next submit should reflect the patched defaults for overlapping form fields unless the user has edited the form since the patch.

## Oracle

README merge rule for inline forms; `dashboardFormValues` (`admin.tsx` ~768–770) prefers stored form state when present; `actionFormPayload` (`admin-invocation.ts` ~136–148) reads only from form values, not re-seeded from patched `action.payload`.

## Counterexample

1. Action has inline form field `format` with default `"short"` and manifest `payload.format: "short"`.
2. User sets `format` to `"long"` and runs successfully.
3. Server returns `result.action.payload: { format: "short" }`; `mergeActionPatch` updates `action.payload` only.
4. `formValues` / `formValuesByKey` still hold `{ format: "long" }`.
5. User runs again without editing the form; request sends `format: "long"`, not the patched `"short"`.

## Why It Might Matter

Toggle and reset flows that patch payload server-side do not stick for inline-form actions; the provider receives stale user input on repeat clicks.

## Proof

Dataflow trace: success patch updates `action.payload` in React state → form cache unchanged → `actionFormPayload(action.form, formValues)` → `mergeActionPayload` keeps stale form values winning.

## Counterevidence Checked

Field load resets `formValues` only on manifest reload (~845), not after run-result patch. Excluded `inline-form-reset-on-value` covers unconditional reset when the host `value` prop changes, not post-patch reconciliation. `action-patch.md` examples patch label/confirm only, but `mergeActionPatch` supports `payload` patches generically.

## Suggested Next Step

Reconcile or clear inline form values when `action.payload` is patched, or re-seed form fields from patched defaults for keys not edited since the last run.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed a successful `result.action.payload` patch updated `action.payload` but left `formValues`/`formValuesByKey` holding the user's pre-run edits, which keep winning in `actionFormPayload`/`mergeActionPayload` on the next submit. Added `actionPatchChangesPayload(result)` (true when the patch object has a `payload` key, incl. `payload: null`) and gated re-seeding on it. Field path: on a payload patch, `setFormValues(actionFormInitialValues(patchedAction.form, patchedAction.payload))`. Dashboard path: delete the cached `formValuesByKey[action.key]` so `dashboardFormValues` lazily re-seeds from the patched `action.payload` on the next render. Only payload patches trigger re-seed (label-only/no-patch runs leave form state untouched). Added a unit test for the helper. Typecheck + effects/invocation tests (11) pass.

DEVANA-KEY: src/admin.tsx:428 | form-stale-after-payload-patch
DEVANA-SUMMARY: fixed | P2 | high | After a result patches action.payload, inline form values are re-seeded (field: setFormValues; dashboard: clear cached key to re-seed lazily) so the next submit reflects the patched defaults instead of stale user edits.