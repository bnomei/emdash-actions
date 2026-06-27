DEVANA-FINDING: v1
Priority: P3 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/index.ts:163 | Slug: provider-config-fails-all

# One invalid provider config aborts the entire providers response

## Finding

`normalizeProviders` (src/index.ts:160) maps every provider through `normalizePluginId`
and `normalizePluginRoute`, both of which throw on invalid input. The mapping has no
per-provider isolation, so a single misconfigured provider throws out of the whole
`flatMap`, and because `providersRoute` is called eagerly inside `createPlugin`
(src/index.ts:126), the entire providers response is never produced — disabling every
provider's actions, not just the offending one.

## Violated Invariant Or Contract

A single misconfigured provider should degrade only that provider; valid providers should
still load. The admin-side loader establishes exactly this policy and the server-side
normalizer contradicts it.

## Oracle

Cross-entry mismatch: `loadProviderActions` (admin.tsx:1116-1124) wraps each provider in
its own try/catch and emits a per-provider `ProviderError` while keeping the others.
`normalizeProviders` (index.ts:163-179) performs the opposite — fail-all — for the same
"untrusted-ish" provider config.

## Counterexample

```ts
createPlugin({ providers: [
  { pluginId: "good-provider" },
  { pluginId: "bad id!" },        // space + "!" fail PLUGIN_ID_PATTERN
] });
```

`normalizePluginId("bad id!")` throws `Invalid plugin id: bad id!` (shared.ts:24). The
throw inside the `flatMap` callback propagates out of `normalizeProviders` ->
`providersRoute` -> `createPlugin`, so `good-provider` never loads and the `providers`
route is never registered. The same occurs via an invalid `manifestRoute`/`runnerRoute`
hitting `normalizePluginRoute` (e.g. `manifestRoute: "a?b"`).

## Why It Might Matter

A single typo in one provider's id or route takes down the entire action surface (all
providers) instead of surfacing one provider error, contradicting the admin UI's
per-provider error handling. Impact is a configuration-time outage of the whole widget;
P3 because it requires a misconfiguration and is dev-detectable.

## Proof

Control-flow / exception propagation: index.ts:126 `createPlugin` calls
`providersRoute(options)` -> index.ts:155 `normalizeProviders(options.providers)` ->
index.ts:165 `normalizePluginId` throws -> propagates out of `flatMap`, `providersRoute`,
and `createPlugin`. Contrast admin.tsx:1118-1123 per-provider catch.

## Counterevidence Checked

Searched all callers of `normalizeProviders`/`providersRoute`: none wrap the call in
try/catch. `createPlugin` invokes it eagerly (not lazily inside the async route handler),
so the failure precedes route registration. `normalizeProviderConfig` (admin-manifest.ts:727)
has the same fail-fast shape. No guard isolates a single bad provider.

## Suggested Next Step

Normalize each provider inside a per-provider try/catch (skip or mark invalid providers
and keep the valid ones), matching the admin-side `ProviderError` isolation, or validate
lazily so one bad entry does not block route registration.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `normalizeProviders` ran each provider's `normalizePluginId`/`normalizePluginRoute` inside a `flatMap` with no isolation, and `providersRoute` is called eagerly in `createPlugin`, so one bad id/route threw out of the whole response and disabled every provider. Wrapped the per-provider normalization in try/catch returning `[]` on failure, so the offending provider is dropped and valid ones still load — matching the admin-side per-provider `ProviderError` isolation. Chose skip-and-keep (the report's primary suggestion); silent because the response type has no per-provider error channel server-side (the admin loader already surfaces missing/failed providers). Added test/index.test.ts covering valid normalization, an invalid id dropped while neighbours survive, and an invalid route dropped. Typecheck + new tests (3) pass.

DEVANA-KEY: src/index.ts:163 | P3 | provider-config-fails-all
DEVANA-SUMMARY: Status=fixed | P3 high src/index.ts:163 - normalizeProviders now isolates each provider in try/catch, so an invalid id/route drops only that provider and the rest of the providers response still loads.
