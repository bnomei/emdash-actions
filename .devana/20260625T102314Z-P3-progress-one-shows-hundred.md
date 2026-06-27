DEVANA-FINDING: v1
Priority: P3 | Confidence: medium | Security-sensitive: no | Status: open
Location: src/admin.tsx:1698 | Slug: progress-one-shows-hundred

# progressLabel renders progress value 1 as "100%"

## Finding

`progressLabel` (src/admin.tsx:1695) treats any numeric progress `value <= 1` as a
fraction and multiplies by 100, while values `> 1` are treated as already-formed
percentages. The boundary is inclusive at `1`, so an integer percentage of `1` (one
percent) is rescaled to `100%`.

## Violated Invariant Or Contract

The progress display must reflect actual completion. The function already supports
integer percentages (values `> 1` are passed through, e.g. `50` -> "50%"), so the
integer percentage `1` should render "1%", not "100%".

## Oracle

Boundary / just-before-after. The `value > 1` branch establishes that integer
percentages are a supported input convention; the inclusive `<= 1` cutoff collides with
the legitimate integer percentage `1`.

## Counterexample

A provider reporting integer-percentage progress sends `progress: 1` to mean 1% done.
`numberOrNull(1) = 1`; `1 <= 1` is true; `normalized = 1 * 100 = 100`; returns `"100%"`.
By contrast `progress: 2` renders "2%", so only the exact value `1` is wrong for that
convention.

## Why It Might Matter

During the polling progress phase, `resultMessage` appends `(100%)` (admin.tsx:1640/1646)
for a job that has barely started, telling the user it is essentially complete. Display
correctness only — no data impact — hence P3.

## Proof

Counterexample value -> wrong string: admin.tsx:1697 `value <= 1` true for `1` ->
admin.tsx:1698 `value * 100` = 100 -> `"100%"`. Inconsistent with the pass-through branch
for `value > 1`.

## Counterevidence Checked

`value = 0` -> "0%" (correct fraction). `value = 0.5` -> "50%" (correct fraction).
`value = 2..100` -> unscaled (correct percentages). The function has no unit signal to
disambiguate fraction vs percentage, but it already commits to the integer-percentage
interpretation for everything `> 1`, so resolving `1` as a fraction is internally
inconsistent. Manifest-parsed labels cannot be empty, so this is purely the numeric
boundary.

## Suggested Next Step

Decide a single progress convention (fraction 0..1 vs integer percentage) and document
it; if both must be supported, use `value < 1` for the fraction branch or require an
explicit unit so `1` is not ambiguous.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection.

DEVANA-KEY: src/admin.tsx:1698 | P3 | progress-one-shows-hundred
DEVANA-SUMMARY: Status=open | P3 medium src/admin.tsx:1698 - progressLabel treats value<=1 as a fraction, so an integer-percentage progress of 1 (1%) is rendered as "100%" during polling.
