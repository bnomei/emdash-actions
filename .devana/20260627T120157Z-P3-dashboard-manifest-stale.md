DEVANA-FINDING: v1
DEVANA-STATE: wontfix | P3 | medium | security=no
DEVANA-KEY: src/admin.tsx:364 | dashboard-manifest-stale

# Dashboard provider manifest cached for widget lifetime

## Finding

`ActionsWidgetContent` loads provider manifests once on mount and again only when `targetType` changes. Server-side manifest updates during an admin session without a full page reload or widget remount are not reflected in the action list.

## Violated Invariant Or Contract

Discovered dashboard actions should reflect the current provider manifest for the session when manifests change without a full reload.

## Oracle

Load `useEffect` dependency array `[targetType]` only (`admin.tsx` ~364–385); `loadProviderActions` / `fetchManifest` called from that effect.

## Counterexample

1. Dashboard widget mounts and loads manifests.
2. Provider adds a new action id server-side.
3. Widget `state.actions` is unchanged; `useEffect` does not rerun because `targetType` is stable.
4. New action appears only after manual page reload.

## Why It Might Matter

Low severity in typical deployments where manifests are static until redeploy, but confusing during provider development or dynamic manifest rollout.

## Proof

Read path: initial `fetchManifest` populates `state.actions` → server manifest changes → no invalidation hook → stale action list until remount/reload.

## Counterevidence Checked

Field widgets refetch when `options`/`value` change. `applyActionUpdate` patches individual actions in memory but does not refresh the full manifest. Manifests are commonly deployment-static; impact is mainly developer ergonomics.

## Suggested Next Step

Add optional manifest refresh on focus/interval, or document that dashboard discovery requires reload after manifest changes.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: wontfix (behavior intentional; documented). Confirmed the dashboard load effect deps are `[targetType]`, so manifests are fetched once per mount / surface change. The report itself notes manifests are "commonly deployment-static" and the impact is "mainly developer ergonomics" (P3/medium). Chose the report's second suggested option (document) over auto-refresh because focus/interval refetching has concrete downsides here: it would discard in-memory action patches applied by `applyActionUpdate` (toggle labels, patched payloads) and churn/reorder the action list on every focus — a worse UX than the stale-manifest ergonomics gap. Added a "Manifest caching" note to README (under Providers And Manifests) explaining the session-cache behavior, the rationale, and that a page reload surfaces manifest changes during provider development. No runtime change.

DEVANA-KEY: src/admin.tsx:364 | dashboard-manifest-stale
DEVANA-SUMMARY: wontfix | P3 | medium | Per-session manifest caching is intentional (auto-refresh would wipe in-memory action patches and churn the list); documented the behavior and the reload-to-refresh guidance in README instead of changing runtime behavior.