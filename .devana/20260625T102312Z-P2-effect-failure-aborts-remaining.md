DEVANA-FINDING: v1
Priority: P2 | Confidence: high | Security-sensitive: no | Status: open
Location: src/admin-effects.ts:197 | Slug: effect-failure-aborts-remaining

# One failing effect aborts the remaining effects and flips success to failure

## Finding

`runActionEffects` (src/admin-effects.ts:183) applies the result effects strictly in
sequence with awaited calls and no per-effect error isolation: clipboard (line 197),
download (line 200), open (line 203), reload (line 206). If an earlier effect throws,
the later independent effects never run, and the throw propagates to the run caller,
which converts an already-successful action into a displayed error.

## Violated Invariant Or Contract

Independent effects declared in one result (e.g. `{ clipboard, reload }`) should apply
independently. Failure of one routine, non-fatal effect must not silently cancel the
others, nor reclassify a terminally-successful action as a failure.

## Oracle

Each effect is gated by its own `if` (admin-effects.ts:196-206), implying independence.
A single result can legitimately request several effects together (the
`ActionResultEffects` shape supports `clipboard`, `download`, `open`, and `reload`
simultaneously — see admin-effects.ts:209-216).

## Counterexample

Result effects `{ clipboard: { text: "x" }, reload: true }` on a page served over plain
HTTP. `clipboardEffectText` returns the text, so `await writeClipboard(...)` runs;
`writeClipboardText` throws `Clipboard access requires HTTPS or localhost...`
(admin-effects.ts:371). The throw at line 197 short-circuits `runActionEffects`, so the
`reload` at line 206 is never scheduled, and the error propagates to admin.tsx:536/992,
displaying a failure for an action the server reported as succeeded. The same shape
occurs when `open` carries a rejected URL (`safeBrowserUrl` throws at admin-effects.ts:364)
after clipboard has already irreversibly written.

## Why It Might Matter

A user on a non-secure context (or who has denied clipboard permission) loses the
expected page reload / data refresh after a successful action, and sees a confusing
error instead of success. Effects are also left half-applied (clipboard written, reload
skipped) with no rollback.

## Proof

Control-flow trace: admin.tsx:507/962 `runActionEffects` -> admin-effects.ts:197
`await writeClipboard(clipboard)` throws -> remaining `if` blocks (200/203/206) skipped
-> exception unwinds to the run's `catch` (admin.tsx:536/992), which sets error feedback
unless it is an AbortError.

## Counterevidence Checked

There is no try/catch inside `runActionEffects`; the only catch is the run caller, which
treats any throw as a run failure. The effects are heterogeneous side effects, not a
documented all-or-nothing transaction, so the all-or-nothing behavior is incidental rather
than intended. This is distinct from the existing `result-writeback-blocked-by-effect`
finding (which is about field writeback sequenced after effects); here the defect is
effects aborting each other plus the success->failure reclassification.

## Suggested Next Step

Wrap each effect in its own try/catch within `runActionEffects` (collect and surface
failures without aborting later effects), or at minimum run `reload` independently of the
clipboard/open outcome so a clipboard-permission error cannot suppress a requested reload.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin-effects.ts:197 | P2 | effect-failure-aborts-remaining
DEVANA-SUMMARY: Status=open | P2 high src/admin-effects.ts:197 - runActionEffects runs effects sequentially with no isolation, so a clipboard/open failure skips the remaining effects (e.g. reload) and converts a successful action into a displayed error.
