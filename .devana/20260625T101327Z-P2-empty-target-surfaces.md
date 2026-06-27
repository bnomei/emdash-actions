DEVANA-FINDING: v1
Priority: P2 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/admin-invocation.ts:50 | Slug: empty-target-surfaces

# Empty `target.surfaces` parses successfully but hides the action everywhere

## Finding

`readOptionalTargetSurfaces` accepts an empty array, and `actionMatchesTargetRequirement` treats a truthy empty `surfaces` array as a restrictive filter that matches no target type. Parsed actions therefore never appear in the dashboard or field widgets and cannot pass submit validation.

## Violated Invariant Or Contract

Omitted `target` means no surface restriction (`!surfaces` → match all). A manifest that explicitly sets `target: []` or `target: { surfaces: [] }` should either behave like unrestricted targeting or be rejected at parse time.

## Oracle

`actionMatchesTargetRequirement` (`admin-invocation.ts:50-56`) and README examples only show non-empty `surfaces` arrays or omitted `target`.

## Counterexample

Manifest action:

```json
{ "id": "cache.clear", "label": "Clear", "runner": true, "target": { "surfaces": [] } }
```

- `parseActionsManifest` succeeds.
- `actionMatchesTargetRequirement(action, "dashboard")` → `false` because `![]` is `false` and `[].includes("dashboard")` is `false`.
- `actionTargetValidationError` rejects any concrete target with "Action target surface is not available."

## Why It Might Matter

A provider typo or generator bug can silently register actions that never render and cannot be invoked, with no parse-time error to surface the mistake.

## Proof

**Counterexample value:** `surfaces: []` is truthy in JavaScript, so the unrestricted-target fast path `!surfaces` does not run; `includes` on an empty array is always false.

## Counterevidence Checked

- README does not document `[]` as meaning "no surfaces".
- Parser deduplicates non-empty surface lists correctly; only the empty-array case is broken.
- Duplicate-id and route validation do not catch empty surface lists.

## Suggested Next Step

Reject empty `surfaces` arrays in `readOptionalTargetSurfaces`, or treat `[]` the same as omitted `target`.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `surfaces: []` is truthy, so `actionMatchesTargetRequirement`'s `!surfaces` fast path was skipped and `[].includes(type)` was always false, hiding the action everywhere. Chose the "reject at parse time" option (over silently treating `[]` as unrestricted) so a provider typo surfaces loudly. Added an empty-array guard in both manifest paths that produce surfaces: the direct `target: []` array branch and `readOptionalTargetSurfaces` (`target: { surfaces: [] }`), each throwing "must list at least one surface; omit it for no restriction". Added regression tests for both shapes. Typecheck + manifest tests (9) pass.

DEVANA-KEY: src/admin-invocation.ts:50 | P2 | empty-target-surfaces
DEVANA-SUMMARY: Status=fixed | P2 high src/admin-invocation.ts:50 - Empty target.surfaces arrays are now rejected at parse time (both target: [] and target: { surfaces: [] }), so a typo can no longer silently register a hidden, unsubmittable action.