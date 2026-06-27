DEVANA-FINDING: v1
Priority: P2 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/admin.tsx:962 | Slug: result-writeback-blocked-by-effect

# `resultValueKey` writeback is skipped when a result effect throws

## Finding

On successful field runs, `runFieldAction` awaits `runActionEffects` before `applyFieldResultValue`. If any effect handler throws (for example clipboard permission denied), the success path aborts before writing the returned value into the field.

## Violated Invariant Or Contract

README documents `resultValueKey` as writing a returned result value back into the field on a successful action. That writeback should not depend on unrelated browser effects succeeding.

## Oracle

`examples/direct-route-field-action.md` and README field options describe `resultValueKey` as a field writeback independent of optional `effects`.

## Counterexample

1. Field button sets `resultValueKey: "title"`.
2. Provider returns `{ ok: true, status: 200, title: "New Title", effects: { clipboard: { text: "copy" } } }`.
3. `isSuccessfulTerminalResult(finalResult)` is true.
4. `writeClipboardText` throws because clipboard permission is denied.
5. `runActionEffects` rejects; `applyFieldResultValue` is never reached.
6. Catch path shows error feedback and the field value stays unchanged.

## Why It Might Matter

A successful server mutation paired with a failed cosmetic effect leaves the admin UI showing stale field data, causing duplicate submits or user distrust of the action result.

## Proof

**Control-flow trace:** success branch in `runFieldAction` (`admin.tsx:959-963`) orders `await runActionEffects(action, finalResult)` before `applyFieldResultValue(finalResult, options, onChange)` with no isolation or try/finally around effects.

## Counterevidence Checked

- Dashboard widget has no `resultValueKey` path.
- Results without effects write back correctly.
- `mergeActionResultPatch` / `setAction` happens before effects, so descriptor state can update even when writeback is skipped.

## Suggested Next Step

Run `applyFieldResultValue` before effects, or wrap effect execution so writeback still commits on terminal success.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed the success branch awaited `runActionEffects` before `applyFieldResultValue`, so a throwing effect (e.g. denied clipboard) jumped to the catch and skipped the field writeback. Reordered: `applyFieldResultValue(finalResult, options, onChange)` now runs immediately after the descriptor patch and before `await runActionEffects(...)`, so the `resultValueKey` writeback commits independently of optional browser effects. Typecheck + effects tests pass.

DEVANA-KEY: src/admin.tsx:962 | P2 | result-writeback-blocked-by-effect
DEVANA-SUMMARY: Status=fixed | P2 high src/admin.tsx:962 - resultValueKey field writeback now runs before runActionEffects, so a failing clipboard/download/open effect no longer prevents updating the field on success.