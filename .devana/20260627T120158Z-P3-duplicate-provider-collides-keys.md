DEVANA-FINDING: v1
DEVANA-STATE: fixed | P3 | high | security=no
DEVANA-KEY: src/admin.tsx:1144 | duplicate-provider-collides-keys

# Duplicate pluginId entries collide action keys and busy state

## Finding

`normalizeProviders` does not deduplicate provider entries by `pluginId`. `loadProviderActions` builds each action’s `key` as `actionBusyKey(provider.pluginId, action.id)` with no disambiguator. Two `providers` entries with the same `pluginId` and the same manifest `action.id` produce duplicate React keys and shared busy scope.

## Violated Invariant Or Contract

Each rendered action row should have a unique key and independent busy tracking per configured provider entry.

## Oracle

`normalizeProviders` (`index.ts` ~160–179) maps without dedupe; `parseActionsManifest` rejects duplicate ids within one manifest only; key assignment (`admin.tsx` ~1142–1144).

## Counterexample

`providers: [{ pluginId: "cache-actions", ... }, { pluginId: "cache-actions", ... }]` with the same manifest `action.id` `"cache.clear"` yields two rows with key `cache-actions:cache.clear`, coupled busy state, and undefined React list key behavior.

## Why It Might Matter

Misconfigured `actionsPlugin({ providers })` can disable one button while the other runs, or cause unpredictable React reconciliation. Unlikely in normal single-entry configs.

## Proof

Config state with duplicate normalized `pluginId` → merged manifest actions → duplicate `UiAction.key` in `state.actions` map → `isActionBusy` treats both buttons as one action.

## Counterevidence Checked

Per-provider fetch failures are isolated separately. Duplicate ids across different `pluginId` values are fine. Typical configs list each provider once.

## Suggested Next Step

Deduplicate by `pluginId` in `normalizeProviders` with a warning, or include a provider index in `action.key`.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `DEVANA-STATE: ...` and the final `DEVANA-SUMMARY:` status/priority/confidence prefix. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Keep `DEVANA-KEY:` stable unless the same finding moved. Add dated notes below with evidence checked.

## Status Notes

- 2026-06-27: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `normalizeProviders` did not dedupe by pluginId, so two entries with the same pluginId produced colliding `pluginId:action.id` keys (duplicate React list keys + shared busy scope via `isActionBusy`). Applied the report's first suggested option (dedupe by pluginId) in `normalizeProviders`: a `seenPluginIds` set drops later entries that repeat an already-seen normalized pluginId, keeping the first. This composes with the per-provider try/catch isolation from provider-config-fails-all. Silent (no logging convention; consistent with the per-provider skip). Added a test asserting a repeated pluginId is collapsed to one entry (first wins, its manifestRoute kept) while a distinct pluginId is preserved. Typecheck + index tests (4) pass.

DEVANA-KEY: src/admin.tsx:1144 | duplicate-provider-collides-keys
DEVANA-SUMMARY: fixed | P3 | high | normalizeProviders now dedupes provider entries by pluginId (first wins), so duplicate entries can no longer produce colliding action keys or shared busy state.