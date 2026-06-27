DEVANA-FINDING: v1
Priority: P2 | Confidence: high | Security-sensitive: no | Status: fixed
Location: src/admin-polling.ts:130 | Slug: succeeded-202-skips-effects

# Terminal `jobStatus: "succeeded"` with HTTP 202 skips success handling

## Finding

`isSuccessfulTerminalResult` treats any `status: 202` response as non-terminal success even when `jobStatus` is already `"succeeded"`. Polling stops correctly, but dashboard and field widgets skip `runActionEffects`, action patches, and the success feedback branch.

## Violated Invariant Or Contract

Once polling ends on a terminal success job, the success completion path should run consistently with `resultPhase(result) === "success"`.

## Oracle

`test/admin-polling.test.ts` covers `jobStatus: "succeeded"` only with `status: 200`. `examples/async-job.md` shows terminal poll bodies using `status: 200`. Nothing in `readJobStatus` or `isTerminalJobResult` forbids `202` with a succeeded job.

## Counterexample

After `waitForActionResult`, the client receives:

```json
{ "ok": true, "status": 202, "jobStatus": "succeeded", "effects": { "reload": true } }
```

- `shouldContinuePolling` → `false` (`"succeeded"` is not pending).
- `resultPhase` → `"success"`.
- `isSuccessfulTerminalResult` → `false` because `result.status !== 202` is false.
- `admin.tsx` takes the non-success branch: no `runActionEffects`, no `applyActionUpdate` / `mergeActionResultPatch`.

## Why It Might Matter

Providers that keep `status: 202` on the final poll body can strand reload, download, clipboard, and toggle-patch behavior even though the job finished successfully.

## Proof

**Contract mismatch:** `shouldContinuePolling` and `isTerminalJobResult` use `jobStatus`, but `isSuccessfulTerminalResult` gates success dispatch on HTTP `status !== 202` instead of terminal job status.

## Counterevidence Checked

- Documented async example uses `status: 200` on completion, which masks the bug in the happy-path docs.
- `feedbackFromResult` can still classify the phase as success while the success branch is skipped.
- No caller recomputes success from `resultPhase` when `isSuccessfulTerminalResult` is false.

## Suggested Next Step

Treat terminal `jobStatus` values (or `isTerminalJobResult`) as success in `isSuccessfulTerminalResult`, or normalize `202 + succeeded` before the widget branches.

## Agent Handoff

After working this report, preserve the original finding body. Update line 2 `Status: ...` and the final `DEVANA-SUMMARY:` status. Use one of: `open`, `fixed`, `invalid`, `stale`, `duplicate`, `wontfix`. Add dated notes below with the evidence checked.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.
- 2026-06-27: fixed. Confirmed `isSuccessfulTerminalResult` gated on `result.status !== 202`, so a terminal `jobStatus: "succeeded"` body with HTTP 202 was treated as non-success while `shouldContinuePolling`/`resultPhase` classified it as success — stranding effects/patches. Added a short-circuit: `readJobStatus(result) === "succeeded"` returns true before the 202 check. Minimal by design — only an explicitly succeeded job overrides the 202 rejection; all other paths (unknown jobStatus, plain 202 accepted) are unchanged. Added a regression test asserting `shouldContinuePolling` false and `isSuccessfulTerminalResult` true for `{ jobStatus: "succeeded", status: 202 }`. Typecheck + polling tests pass.

DEVANA-KEY: src/admin-polling.ts:130 | P2 | succeeded-202-skips-effects
DEVANA-SUMMARY: Status=fixed | P2 high src/admin-polling.ts:130 - A succeeded async job carrying status 202 now passes isSuccessfulTerminalResult, so success effects and patches run consistently with resultPhase.