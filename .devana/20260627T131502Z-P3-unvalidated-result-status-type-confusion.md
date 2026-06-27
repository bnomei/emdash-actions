DEVANA-FINDING: v1
DEVANA-STATE: open | P3 | medium | security=no
DEVANA-KEY: src/admin-effects.ts:54 | unvalidated-result-status-type-confusion

# Object run-result is cast without validation, so a wrong-typed status misclassifies an error as success

## Finding

`normalizeActionRunResult` validates the string / null / undefined branches of a
provider response but rubber-stamps the object branch: `if (record) return record
as ActionRunResult`. The provider therefore controls `result.status` /
`result.ok` / `result.jobStatus` with arbitrary types. Because the polling
classifiers guard the error path with `typeof result.status === "number"`, a
string `status` such as `"500"` slips past `isErrorResult` and then satisfies
`isSuccessfulTerminalResult`, so a failed result is reported as a successful
terminal result and success effects run.

## Violated Invariant Or Contract

`normalizeActionRunResult` (the producer) is meant to turn arbitrary `unknown`
provider output into a well-formed `ActionRunResult` whose `status` is numeric; the
consumers compare `result.status === 202` and `result.status >= 400`. The object
branch performs no coercion, so the numeric-status invariant the consumers rely on
is not actually established.

## Oracle

`normalizeActionRunResult` (`src/admin-effects.ts:49-85`) explicitly normalizes the
string/null/undefined cases but returns the object case unchanged (line 53-54).
`result.status` is sourced from the provider JSON body via `parseApiResponse`
(admin.tsx:1353,1368) — not the numeric HTTP status — so its type is
provider-controlled. `isErrorResult` (`src/admin-polling.ts:122-128`) only reaches
the `>= 400` comparison when `typeof result.status === "number"`.

## Counterexample

Provider returns HTTP 200 with body `{ "status": "500" }` (status serialized as a
string, `ok` absent). Trace:

- `isErrorResult`: not conflict-reload; no `jobStatus`; `result.ok === false` is
  false; `typeof "500" === "number"` is false, so the `>= 400` branch is skipped ->
  returns `false` (not an error).
- `shouldContinuePolling`: `"500" === 202` is false -> no polling.
- `isSuccessfulTerminalResult`: not error, not polling, `"500" !== 202` is true ->
  **true**, i.e. a successful terminal result.

The run is reported as succeeded, success effects execute, and the failure is
hidden. The mirror case `{ "status": "202" }` defeats `shouldContinuePolling`'s
`=== 202` and ends polling early as a false success.

## Why It Might Matter

A provider-reported failure is shown to the operator as success, and any success
effects (writeback, reload, download) fire on a failed action. Correctness/data
impact when triggered; severity held at P3 because it requires a provider to emit a
wrong-typed `status` field rather than a number.

## Proof

Contract mismatch / wrong-classification-value: producer
(`normalizeActionRunResult`, effects.ts:54) promises a numeric `status` but does
not enforce it; consumer (`isErrorResult`/`isSuccessfulTerminalResult`,
polling.ts:122-134) misclassifies a string `status`. Concrete counterexample value
`"500"` above.

## Counterevidence Checked

- No downstream coercion: `numberOrNull` is applied only to `pollAfterMs` /
  `cooldownMs`, never to `status`; the cast record flows directly into the polling
  module.
- Strongest false reason: "the server contract guarantees a numeric status." Per
  README the provider is only semi-trusted, and the function's stated job is to
  normalize arbitrary `unknown` output, yet it validates the primitive branches and
  skips object-field validation. The asymmetry is the defect.
- This is distinct from `string-poll-ends-early` (effects.ts:56), which concerns a
  plain-string body, not an object body with a wrong-typed field.

## Suggested Next Step

In `normalizeActionRunResult`, coerce/validate the object branch: ensure `status`
is a finite number (or drop it), `ok` is a boolean, and `jobStatus` is a string,
before returning, so the polling classifiers' type assumptions hold.

## Agent Handoff

Preserve the original finding body. Update line 2 `DEVANA-STATE:` and the final
`DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Verified cast at admin-effects.ts:53-54, status
  source at admin.tsx:1353/1368, classification guards at admin-polling.ts:122-134.

DEVANA-KEY: src/admin-effects.ts:54 | unvalidated-result-status-type-confusion
DEVANA-SUMMARY: open | P3 | medium | normalizeActionRunResult casts an object provider response without validation, so a wrong-typed status field (e.g. the string "500") bypasses the typeof-number error guard and is classified as a successful terminal result.
