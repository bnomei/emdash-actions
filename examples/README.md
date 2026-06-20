# Action Button Examples

These examples show complete wiring for common `actions:button` use cases. Each
recipe includes the backend route handler, the field or manifest JSON, and the
frontend behavior the editor sees.

Every action button needs visible command text. Manifest actions require a
human-readable `label`; `actions:button` field options should include a
field-local `label` when the field selects a manifest `action`. The outer field
`label` names the field or slot, while the action label names the command. Icons
are optional decoration only.

Start with [Provider Setup](./provider-setup.md) when the button calls backend
code. Clipboard-only field buttons do not need a provider route.

## Recipes

- [Provider Setup](./provider-setup.md): register `actionsPlugin()`, register a
  provider plugin, and expose a manifest route.
- [Sandboxed Provider](./sandboxed-provider.md): expose the same action manifest
  and routes from a standard-format provider running in `sandboxed: []`.
- [Clipboard Field Button](./clipboard-field-button.md): copy literal text, the
  current field value, or a nested JSON value without calling the backend.
- [Direct Route Field Action](./direct-route-field-action.md): a field button
  calls one provider route directly and writes a returned value back into the
  field.
- [Manifest Field Action](./manifest-field-action.md): a field button resolves
  an action from a provider manifest before calling the route.
- [Runner Field Action](./runner-field-action.md): a field button resolves a
  manifest action and posts it to one fixed provider-owned runner route.
- [Runner Dashboard Action](./runner-dashboard-action.md): a dashboard action
  posts through the same provider-owned runner route.
- [Inline Form Action](./inline-form-action.md): collect a few scalar values and
  merge them into the runner payload before submit.
- [Row Target Action](./row-target-action.md): target a host-provided nested row
  with `rowId`, `path`, and current value.
- [Dashboard Action](./dashboard-action.md): the dashboard widget renders a
  global action from a provider manifest.
- [Clipboard Effect](./clipboard-effect.md): backend route returns text that the
  browser copies to the clipboard.
- [Open Effect](./open-effect.md): backend route opens an admin or public URL.
- [Download Effect](./download-effect.md): backend route triggers a protected
  provider download.
- [Toast Notification](./toast-notification.md): backend route shows a Kumo
  toast and keeps inline button feedback.
- [Feedback And Colors](./feedback-and-colors.md): configure progress/success
  labels and custom button colors.
- [Action Patch](./action-patch.md): backend route updates the clicked button's
  stable label, icon, tone, or payload.
- [Async Job](./async-job.md): backend route accepts work and the button polls a
  status route until the job finishes.

## Route Shape

Provider routes are always relative to the provider plugin:

```txt
/_emdash/api/plugins/<pluginId>/<route>
```

For example, this field action:

```json
{
  "provider": "slug-actions",
  "route": "field/slugify",
  "label": "Generate slug"
}
```

calls:

```txt
POST /_emdash/api/plugins/slug-actions/field/slugify
```

Routes must stay relative. Do not use absolute URLs, query strings, hashes,
encoded paths, traversal segments, or backslashes.

Runner mode is different: a manifest action with `runner: true` or
`runner: { route }` does not declare a business route. The browser posts
`{ invocationId, actionId, payload, context, target }` to the provider runner
route, which defaults to
`.well-known/actions/run`. The provider must resolve `actionId` from a fixed
server-side registry and re-read any target document before mutating it.

## Field JSON Location

When an example says `Field JSON`, paste that object into the target collection
schema's `fields` array. In a typical project, that means the seed JSON or seed
module that defines EmDash collections and fields. It is not an Astro integration
option and it does not go inside `actionsPlugin()`.

## Backend Code Location

When an example says `Backend Code`, create that provider module in your project
and register its exported factory in `astro.config.mjs`. Those route handlers run
on the EmDash server, not in the browser. The handler receives `RouteContext` as
`ctx`, so it can read the request, log, generate timestamps, use `ctx.kv` for
plugin state, call `ctx.url()`, and use capability-gated APIs such as
`ctx.content` when the plugin declares `capabilities: ["content:read"]`.

The recipe files use native-format providers with `definePlugin()` because that
is the shortest local project setup. Provider actions do not have to be native,
though. `emdash-actions` only calls EmDash plugin API routes, so a standard
provider can run trusted in `plugins: []` or isolated in `sandboxed: []` as long
as it exposes the same manifest route and action routes. See
[Sandboxed Provider](./sandboxed-provider.md) for the authoring differences.
