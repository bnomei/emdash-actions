DEVANA-FINDING: v1
Priority: P2 | Confidence: medium | Security-sensitive: no | Status: fixed
Location: src/admin-effects.ts:56 | Slug: string-poll-ends-early

# Plain-string poll body is normalized to terminal success, ending polling early

## Finding

During async-job polling, `pollActionStatus` (src/admin.tsx:1372) runs every status
response through `normalizeActionRunResult`. When the status endpoint returns a bare
string, the string branch (src/admin-effects.ts:56) wraps it as
`{ ok: true, status: 200, message }` with no `jobStatus` and no `statusRoute`. Back in
`waitForActionResult`, `shouldContinuePolling` then returns false and the loop exits,
treating a still-running job as a successful terminal result.

## Violated Invariant Or Contract

A status poll that does not indicate completion must keep the polling loop alive. The
loop must not terminate and report an unfinished job as a successful terminal result.

## Oracle

`shouldContinuePolling` / `isTerminalJobResult` (admin-polling.ts:73-86) distinguish
"still running" from "done" using `jobStatus` (PENDING set) or `status === 202`. The
normalizer's explicit string branch (admin-effects.ts:56) shows plain-text bodies are an
anticipated input, but it hardcodes `status: 200` and omits `jobStatus`.

## Counterexample

An action without a `resultEffect` whose status route returns a plain-text body such as
`"still working"` while running. `parseApiResponse` yields the string;
`normalizeActionRunResult` returns `{ ok: true, status: 200, message: "still working" }`.
In `waitForActionResult` (admin-polling.ts:45-58): `shouldContinuePolling` sees no
`jobStatus` and `status === 200 !== 202` -> false -> loop exits;
`isSuccessfulTerminalResult` returns true (`status !== 202`). The running job is reported
finished, and effects/field writeback are applied prematurely.

## Why It Might Matter

A long-running job whose status endpoint emits text (instead of the JSON envelope)
appears to finish after the first poll. Success feedback, result effects, and field
writeback all fire while the job is actually still in progress, producing a wrong UI
state and possibly a premature/empty result write.

## Proof

Dataflow + loop-condition trace: admin.tsx:1368 `parseApiResponse` (string) ->
admin.tsx:1372 `normalizeActionRunResult` -> admin-effects.ts:56 string branch
(`status: 200`, no `jobStatus`) -> admin-polling.ts:55 assigns `result` ->
admin-polling.ts:45 loop condition `shouldContinuePolling(result)` false -> loop ends ->
admin.tsx:959/505 `isSuccessfulTerminalResult` true.

## Counterevidence Checked

If `action.resultEffect` is set, the string branch routes through
`effectsFromResultEffect` first (admin-effects.ts:57), but that still returns
`status: 200` with no `jobStatus`, so polling still terminates. If the provider always
returns a JSON envelope with `jobStatus`/`status: 202` during polling, the bug does not
trigger — but the normalizer explicitly handles strings, so a text poll body is within
the anticipated input space. The initial (non-poll) call legitimately treats a string as
a sync result; the defect is reusing that normalization for a status poll.

## Suggested Next Step

Treat a plain-string poll response as non-terminal (or preserve the prior `jobStatus`/
`status: 202`) when the action is in the accepted/polling state, so a text body does not
end the loop. Alternatively, only allow string-as-success normalization for the initial
call, not for status polls.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `pollActionStatus` reused `normalizeActionRunResult` for status polls, so a bare-string poll body became `{ ok: true, status: 200, message }` (no jobStatus) → `shouldContinuePolling` false → loop exited and reported a still-running job as terminal success. Implemented the report's "string-as-success only for the initial call" option: added an exported `normalizePollResult(action, statusRoute, value)` in admin-polling.ts that, for a string body, returns `{ ok: true, status: 202, statusRoute, message }` (keeps polling, preserves the route, surfaces the text as progress) and otherwise delegates to `normalizeActionRunResult`. `pollActionStatus` now calls it; the initial run call still uses `normalizeActionRunResult` (a string there is a legitimate sync result). No import cycle (admin-polling → admin-effects is one-directional). Added a regression test. Typecheck + polling tests (7) pass.

DEVANA-KEY: src/admin-effects.ts:56 | P2 | string-poll-ends-early
DEVANA-SUMMARY: Status=fixed | P2 medium src/admin-effects.ts:56 - Status polls now route string bodies through normalizePollResult, which keeps the job polling (status 202 + statusRoute) instead of reporting a still-running job as a terminal success.
