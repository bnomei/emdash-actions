DEVANA-FINDING: v1
Priority: P2 | Confidence: medium | Security-sensitive: no | Status: open
Location: src/admin-context.ts:134 | Slug: field-target-drops-entry

# `fieldActionTarget` ignores host entry surface context

## Finding

`actionTargetFromContext` can return a `type: "entry"` target when `context.surface === "entry"`, but `fieldActionTarget` only preserves `"field"` and `"row"` targets. Entry context falls through to a synthetic `"field"` target built from route inference.

## Violated Invariant Or Contract

Manifest actions declared with `target: { surfaces: ["entry"] }` should be discoverable and invocable when the host supplies entry context to a field widget, consistent with `ActionSurface` and README entry-target examples.

## Oracle

`dashboardActionTarget` delegates to `actionTargetFromContext` and preserves entry targets. README documents `placement: "entry"` and `target: { surfaces: ["entry"] }`. `test/admin-context.test.ts` covers field and row targets but not entry-on-field.

## Counterexample

1. Host passes `context = { surface: "entry", collection: "posts", entryId: "post-1" }` to `ActionButtonField`.
2. Provider manifest exposes `{ id: "entry.rebuild", target: { surfaces: ["entry"] }, runner: true }`.
3. `fieldActionTarget(context, input).type` is `"field"`, not `"entry"`.
4. `actionMatchesTargetRequirement(action, "field")` fails and `resolveFieldAction` throws or omits the action.

## Why It Might Matter

Entry-scoped manifest actions cannot be used from field widgets even when the host already provides authoritative entry context, while the dashboard path handles entry correctly.

## Proof

**Cross-entry mismatch:** `actionTargetFromContext` entry branch (`admin-context.ts:173-182`) vs `fieldActionTarget` only handling `field` and `row` before defaulting to `type: "field"` (`admin-context.ts:148-158`).

## Counterevidence Checked

- Primary README `entry.rebuild` example targets the dashboard widget, which partially mitigates common setup.
- Route inference may still populate `entryId` on the synthetic field target, but `target.type` remains `"field"`, failing surface filters.
- No alternate entry-surface branch exists in `fieldActionTarget`.

## Suggested Next Step

Return `contextTarget` unchanged when `contextTarget.type === "entry"`, mirroring the row branch, and add coverage for entry-targeted manifest actions on field widgets.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin-context.ts:134 | P2 | field-target-drops-entry
DEVANA-SUMMARY: Status=open | P2 medium src/admin-context.ts:134 - Field widgets downgrade entry surface context to type field, so entry-targeted manifest actions never match or submit correctly.