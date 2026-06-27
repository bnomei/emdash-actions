DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | high | security=no
DEVANA-KEY: src/admin-manifest.ts:417 | form-default-unvalidated-blocks-submit

# Form-field default is accepted by the parser but rejected by the submit validator

## Finding

`readFormFields` validates that a `select` field carries non-empty `options`, but
it stores the field's `default` verbatim without checking that the default is a
member of `options` or that its runtime type matches `field.type`. The submit-time
validator (`isValidFormFieldValue`) does enforce both. Because the form is seeded
with the raw default, an action with a bad default cannot be submitted in its
initial (unedited) state — even when the offending field is optional.

## Violated Invariant Or Contract

A manifest-supplied `ActionFormField.default` must be a valid value for that field
under the consumer's own validator, so that an untouched form (with no required
field left empty) is submittable. The parser is the validation boundary
(`ActionFormField.default` is typed `unknown` in `types.ts`).

## Oracle

`readFormFields` (`src/admin-manifest.ts:388-423`) checks select-has-options at
line 418-420 but performs no default-membership or default-type check and stores
`record.default` verbatim (line 417). The consumer disagrees:
`isValidFormFieldValue` (`src/admin-invocation.ts:228-242`) requires a `select`
value to be a member of `options` and a `boolean` value to be `typeof === "boolean"`.
`actionFormInitialValues` (`src/admin-invocation.ts:123-134`) seeds form state with
the raw default, and `actionFormValidationError` (`src/admin-invocation.ts:151-168`)
runs `isValidFormFieldValue` on every non-missing field value, including optional
fields the user never touched.

## Counterexample

Optional select with an out-of-range default:

```json
{ "name": "x", "type": "select", "options": ["a"], "default": "b" }
```

The parser accepts it. `actionFormInitialValues` seeds `{ x: "b" }`. On submit with
no edits, `actionSubmitValidationError` -> `actionFormValidationError` ->
`isValidFormFieldValue` finds `"b"` is not in `["a"]` -> returns `"x is invalid."`,
and `runAction` (admin.tsx:458-462 dashboard / 912 field) aborts the run.

Boolean variant: `{ "name": "y", "type": "boolean", "default": "true" }` seeds the
string `"true"`; the boolean branch requires `typeof === "boolean"` -> `"y is invalid."`

## Why It Might Matter

A button whose manifest sets a mistyped or out-of-range default is silently
unusable: clicking it always fails validation with a confusing per-field error
until the user edits an otherwise-optional control. The provider author gets no
load-time signal that the default is wrong.

## Proof

Contract mismatch (parser vs type vs consumer): parser emits a default the consumer
rejects (admin-manifest.ts:417 vs admin-invocation.ts:235-240), and the submit gate
(admin.tsx:459-462) blocks the unedited form. Concrete counterexample values above.

## Counterevidence Checked

- `actionFormInitialValues` does not normalize the default — it assigns
  `field.default` verbatim and only injects `false` for booleans that have no
  default (line 131), so the bad default reaches validation unchanged.
- TypeScript does not protect this: `default` is `unknown` and the values originate
  from parsed JSON, so "default matches type" never holds at runtime.
- Strongest false reason: "the user can just pick a valid option." True for a field
  the user interacts with, but an optional field with a bad default blocks submit
  even when the user has no reason to touch it; the contract violation (parser
  accepts a value the consumer rejects) holds regardless.

## Suggested Next Step

In `readFormFields`, validate `default` against `field.type` and (for select)
membership in `options` at parse time, so a bad default is rejected when the
manifest loads rather than silently blocking the form.

## Agent Handoff

Preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final
`DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Verified parser at admin-manifest.ts:388-423 and
  consumer at admin-invocation.ts:123-168,228-242, submit gate admin.tsx:458/912.

DEVANA-KEY: src/admin-manifest.ts:417 | form-default-unvalidated-blocks-submit
DEVANA-SUMMARY: open | P2 | high | A form field default that is out-of-options or type-mismatched is accepted by the parser but rejected by the submit validator, so the unedited form (even with the field optional) cannot be submitted.
