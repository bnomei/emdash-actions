DEVANA-FINDING: v1
Priority: P1 | Confidence: high | Security-sensitive: yes | Status: open
Location: src/admin-effects.ts:360 | Slug: open-redirect-protocol-relative

# Open effect allows off-origin navigation via protocol-relative URL

## Finding

`safeBrowserUrl` (src/admin-effects.ts:360) is the only guard on URLs used by the
`open` result effect. It resolves the server-supplied string with
`new URL(value, window.location.href)` and rejects only non-`http(s)` protocols.
A protocol-relative URL such as `//evil.example/x` passes the protocol check while
resolving to a foreign origin. `runOpenEffect` (admin-effects.ts:285) then either
navigates the whole admin away (`globalThis.location.assign` when `target === "self"`)
or opens a new tab (`window.open`).

## Violated Invariant Or Contract

A URL gate whose stated purpose is "http, https, or relative" (see the throw message
at admin-effects.ts:364) must not let a server-controlled value drive navigation to an
arbitrary external origin.

## Oracle

`safeBrowserUrl` only checks `url.protocol !== "http:" && url.protocol !== "https:"`.
Both the `open` url and its `target` come from the action result, which is provider
(server) controlled: `actionResultEffects` reads `result.effects.open`/`result.open`
(admin-effects.ts:209-216), `asOpenEffect` returns `{ url, target }` (admin-effects.ts:226),
and `readOpenTarget` accepts `"self"` (admin-effects.ts:491).

## Counterexample

A manifest action with `resultEffect: "open"` (or a result returning
`effects: { open: { url: "//evil.example/phish", target: "self" } }`). On a successful
run, `runActionEffects` -> `runOpenEffect` -> `safeBrowserUrl("//evil.example/phish")`
returns `https://evil.example/phish` (protocol `https:`), so the protocol guard passes
and `location.assign` navigates the admin UI to the attacker origin. Verified:
`new URL("//evil.example/x", "https://admin.host/admin/page").href` === `https://evil.example/x`.

## Why It Might Matter

A compromised or malicious provider can force the EmDash admin to navigate
(target `"self"`) to an attacker-controlled origin after the user clicks an action —
a phishing / forced-redirect primitive against an authenticated admin session. The
`"blank"` path uses `noopener,noreferrer`, but `"self"` -> `location.assign` has no
such mitigation.

## Proof

Dataflow trace: server result -> `normalizeActionRunResult` (admin.tsx:483) ->
`runActionEffects` (admin.tsx:507) -> `actionResultEffects` reads server `open`
(admin-effects.ts:209-216) -> `asOpenEffect` (server url + target, admin-effects.ts:226)
-> `runOpenEffect` (admin-effects.ts:285) -> `safeBrowserUrl` (admin-effects.ts:360),
whose protocol-only check passes for `//host`.

## Counterevidence Checked

`javascript:`/`data:` are correctly blocked by the protocol check. `normalizePluginRoute`
(shared.ts) blocks path traversal on download routes (separate path). The `"blank"` path
sets `noopener,noreferrer`. None of these constrain the resolved origin for the `"self"`
navigation, and nothing normalizes/rejects protocol-relative or cross-origin absolute URLs
before `location.assign`.

## Suggested Next Step

In `safeBrowserUrl`, after resolving, reject URLs whose origin differs from
`window.location.origin` (or explicitly disallow protocol-relative input), or restrict
`target: "self"` navigation to same-origin URLs only.

## Status Notes

- 2026-06-25: open by Devana. Initial report written from static source inspection. No exploit recipe included.

DEVANA-KEY: src/admin-effects.ts:360 | P1 | open-redirect-protocol-relative
DEVANA-SUMMARY: Status=open | P1 high src/admin-effects.ts:360 - safeBrowserUrl only checks protocol, so a server-controlled open effect with a protocol-relative URL (e.g. //evil.example) navigates the admin off-origin via location.assign.
