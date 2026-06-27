DEVANA-FINDING: v1
Priority: P1 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/admin.tsx:1274 | Slug: valuekey-stale-payload

# Field `valueKey` payload can lag the live field value at click time

## Finding

Field buttons that use `options.valueKey` bake the field value into `action.payload` only when the action descriptor is resolved in `resolveFieldAction`. `runFieldAction` submits that cached payload without re-merging the current `value` prop at invoke time.

## Violated Invariant Or Contract

README and `examples/direct-route-field-action.md` document that `valueKey` includes the **current** field value in the request body when the button is clicked.

## Oracle

`examples/direct-route-field-action.md` ("sends the current field value as `{ \"value\": \"Current field value\" }`") and README field options (`valueKey`: include the current field value).

## Counterexample

1. Configure a field button with `valueKey: "value"` and a direct or manifest-backed route.
2. Initial value `"hello"` resolves into `action.payload = { value: "hello" }`.
3. User edits the field to `"world"`; the load `useEffect` restarts but the previous `action` remains in state while resolution is in flight.
4. User clicks Run before the new descriptor is applied.
5. `callAction` serializes `{ value: "hello" }` while the UI shows `"world"`.

## Why It Might Matter

Direct-route providers that read `payload[valueKey]` can slugify, normalize, or mutate the wrong text. Runner invocations can disagree when `target.value` is built from the live prop but `payload[valueKey]` is stale.

## Proof

**Dataflow trace:** `value` prop → `mergeFieldPayload(..., value)` only inside `resolveFieldAction` (`admin.tsx:1274-1286`) → stored on `action` state → `runFieldAction` → `callAction` → `actionRequestBody` reads `action.payload` (`admin-invocation.ts:75-84`) with no second `valueKey` merge. Meanwhile `fieldActionTarget(..., { value })` (`admin.tsx:942`) uses the click-time prop.

## Counterevidence Checked

- `useEffect` depends on `value` and eventually refreshes the descriptor, but the button stays enabled during async reload (`disabled` only checks `busy` and `!action`, not reload-in-flight).
- Runner actions without `valueKey` pass fresh `target.value` at invoke time and are less affected.
- `test/admin-invocation.test.ts` covers static payloads only, not live `valueKey` refresh at submit.

## Suggested Next Step

Re-apply `mergeFieldPayload(action.payload, options, value)` (or equivalent) immediately before `callAction` in `runFieldAction`, or disable the button until resolution completes after each `value` change.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `runFieldAction` submitted the cached `action.payload` (with the resolve-time `valueKey` value) without re-merging the live prop. `runFieldAction` now builds a `liveAction` via `mergeFieldPayload(action.payload, options, value)` immediately before `callAction`, so the click-time field value is always sent. Typecheck + invocation/effects tests pass.

DEVANA-KEY: src/admin.tsx:1274 | P1 | valuekey-stale-payload
DEVANA-SUMMARY: Status=fixed | P1 high src/admin.tsx:1274 - Field buttons re-merge the live field value into the payload at click time, so a stale valueKey body can no longer be POSTed during in-flight re-resolution.