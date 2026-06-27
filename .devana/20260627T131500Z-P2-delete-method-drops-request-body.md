DEVANA-FINDING: v1
DEVANA-STATE: open | P2 | high | security=no
DEVANA-KEY: src/admin-invocation.ts:98 | delete-method-drops-request-body

# DELETE direct action silently drops its entire request body

## Finding

A direct action whose `method` is `DELETE` sends its request with **no body**. The
form values, `payload` defaults, and `contextKey`-derived context value are all
computed (and pass validation) but are then discarded, because `actionRequestInit`
only attaches a body when `hasJsonBody(method)` is true, and `hasJsonBody` returns
`false` for `DELETE`.

## Violated Invariant Or Contract

Whatever `actionFormPayload` / `mergeActionPayload` / `mergeActionContextPayload`
computes for an action is meant to reach the provider route as the request body.
For a direct `DELETE` action that defines a `form`, `payload`, or `contextKey`,
those values are computed and passed to `actionRequestInit` but never transmitted.

## Oracle

`actionRequestInit` (`src/admin-invocation.ts:87-104`) calls
`actionRequestBody(action, context, target, payload)` — clear intent to send the
body — but guards `init.body = JSON.stringify(...)` behind `hasJsonBody(method)`.
`hasJsonBody` (`src/admin-manifest.ts:686-688`) is `method !== "DELETE"`. There is
no query-string or alternate channel for the dropped values; the route
(`actionRequestRoute` / `directActionRoute`) encodes none of them.

## Counterexample

Manifest direct action:

```json
{ "id": "purge", "label": "Purge", "route": "purge", "method": "DELETE",
  "form": { "fields": [ { "name": "scope", "type": "select", "required": true,
  "options": ["all","drafts"] } ] } }
```

User selects `scope: "drafts"` and clicks. Flow: `runAction` (admin.tsx:458)
validation passes -> `actionFormPayload(action.form, formValues)` yields
`{ scope: "drafts" }` (admin.tsx:491) -> `callAction` -> `actionRequestInit`
(admin.tsx:1351). `actionRequestMethod` returns `"DELETE"`; `hasJsonBody("DELETE")`
is `false`, so the body line is skipped. The DELETE fires with no body and no
`Content-Type`; `scope` is gone. The same loss applies to `payload` defaults and
`contextKey` context values for any DELETE direct action.

## Why It Might Matter

The provider receives a DELETE with none of the user-selected parameters. If the
DELETE relies on those values to scope the deletion (e.g. "delete which variant"),
the backend either errors or deletes the wrong/whole resource. Validation passed,
so the user gets no warning that their input vanished.

## Proof

Dataflow trace: form input -> `actionSubmitValidationError` (passes) ->
`actionFormPayload` => `{scope:"drafts"}` -> `actionRequestInit` body branch
skipped because `hasJsonBody("DELETE") === false`. Control-flow: the only
body-attachment branch in `actionRequestInit` (line 98-101) is bypassed for DELETE.

## Counterevidence Checked

- Runner actions are always POST (`actionRequestMethod` line 39), so they are
  unaffected; this is specific to direct DELETE actions.
- `readMethod` (admin-manifest.ts:234-241) accepts `DELETE`, and the direct
  `ActionDescriptor` type allows `form`/`payload`/`contextKey` alongside
  `method: "DELETE"`, so the configuration is reachable, not hypothetical.
- Strongest false reason: "DELETE is contractually body-less." Rejected — the code
  still computes the payload and passes it into `actionRequestInit`, showing intent
  to send it, and EmDash plugin routes are POST-style handlers that read a JSON
  body. There is no fallback channel, so the values are genuinely lost.

## Suggested Next Step

Either send a JSON body for DELETE when the action defines form/payload/context, or
reject `method: "DELETE"` for actions that carry a body at parse time so the
misconfiguration surfaces loudly instead of silently dropping input.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2
`DEVANA-STATE:` and the final `DEVANA-SUMMARY:` prefix. Keep `DEVANA-KEY:` stable
unless the finding moves.

## Status Notes

- 2026-06-27: open by Devana. Static trace confirmed at admin-invocation.ts:98-101,
  admin-manifest.ts:686-688, and call site admin.tsx:1351.

DEVANA-KEY: src/admin-invocation.ts:98 | delete-method-drops-request-body
DEVANA-SUMMARY: open | P2 | high | A direct action with method DELETE drops its computed request body (form values, payload defaults, contextKey value) because actionRequestInit omits the body when hasJsonBody is false.
