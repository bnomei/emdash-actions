# @bnomei/emdash-actions

[![npm version](https://img.shields.io/npm/v/@bnomei/emdash-actions.svg)](https://www.npmjs.com/package/@bnomei/emdash-actions)
[![npm downloads](https://img.shields.io/npm/dm/@bnomei/emdash-actions.svg)](https://www.npmjs.com/package/@bnomei/emdash-actions)
[![license](https://img.shields.io/npm/l/@bnomei/emdash-actions.svg)](https://www.npmjs.com/package/@bnomei/emdash-actions)
[![types](https://img.shields.io/badge/types-included-blue.svg)](./package.json)
[![source](https://img.shields.io/badge/source-GitHub-181717.svg?logo=github)](https://github.com/bnomei/emdash-actions)

Action buttons for EmDash fields and dashboards.

`@bnomei/emdash-actions` adds configurable buttons to the EmDash admin. A button
can copy a field value in the browser, call an EmDash plugin route, write a
returned value back into a field, or trigger a dashboard-level provider action.

The core split is simple:

- `emdash-actions` owns the admin UI trigger surfaces.
- Provider plugins own the backend work behind those triggers.

That means a provider can be native, standard trusted, or sandboxed, as long as
it exposes normal EmDash plugin API routes.

## Install

```sh
npm install @bnomei/emdash-actions
```

## Quick Start

This quick start wires a single dashboard button that runs backend TypeScript in
an EmDash provider route. The example action clears a cache placeholder, writes
plugin-local state with `ctx.kv`, logs through `ctx.log`, and returns feedback to
the clicked button.

### 1. Create A Provider

Create `src/emdash/cache-actions.ts`:

```ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function cacheActions() {
  return definePlugin({
    id: "cache-actions",
    version: "0.1.0",
    routes: {
      actions: {
        handler: cacheActionsManifestRoute,
      },
      "cache/clear": {
        handler: clearCacheRoute,
      },
    },
  });
}

async function cacheActionsManifestRoute(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "cache.clear",
        label: "Clear cache",
        route: "cache/clear",
        method: "POST",
        placement: "dashboard",
        icon: "bolt",
        tone: "warning",
        confirm: "Clear the site cache?",
      },
    ],
  });
}

async function clearCacheRoute(ctx: RouteContext) {
  const serverTime = new Date().toISOString();
  const clearCount = ((await ctx.kv.get<number>("state:clearCount")) ?? 0) + 1;

  await clearSiteCache(ctx);
  await ctx.kv.set("state:clearCount", clearCount);

  ctx.log.info("Cache clear action completed", {
    clearCount,
    site: ctx.site.name,
    serverTime,
  });

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: `Cache cleared on the server at ${serverTime}.`,
    toast: {
      type: "success",
      title: "Cache cleared",
      message: `${ctx.site.name} cache has been cleared ${clearCount} time(s).`,
    },
  };
}

async function clearSiteCache(ctx: RouteContext) {
  // Replace this with your cache provider, CDN, build, or deployment logic.
  await ctx.kv.set("state:lastClearedAt", new Date().toISOString());
}
```

### 2. Register The UI And Provider

Add `actionsPlugin()` and the provider plugin to the EmDash plugin list in
`astro.config.mjs`:

```ts
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionsPlugin } from "@bnomei/emdash-actions";
import { cacheActions } from "./src/emdash/cache-actions";

const cacheActionsProvider = {
  pluginId: "cache-actions",
  label: "Cache actions",
  manifestRoute: "actions",
};

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        actionsPlugin({
          providers: [cacheActionsProvider],
        }),
        cacheActions(),
      ],
    }),
  ],
});
```

### 3. Click The Button

Open the EmDash dashboard. The `Actions` widget loads:

```txt
GET /_emdash/api/plugins/cache-actions/actions
```

It renders `Clear cache`. Clicking the button calls:

```txt
POST /_emdash/api/plugins/cache-actions/cache/clear
```

The provider route runs on the server, uses EmDash `ctx`, and returns the inline
button feedback plus toast.

> [!NOTE]
> This quick start uses a dashboard action because it shows the whole provider
> loop without needing collection schema changes. Field buttons use the same
> provider route model.

## What To Use

| Goal                                                | Start here                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| Copy a value without backend code                   | [Clipboard Field Button](./examples/clipboard-field-button.md)       |
| Call one backend route from a field                 | [Direct Route Field Action](./examples/direct-route-field-action.md) |
| Use provider-owned action UI and routes             | [Manifest Field Action](./examples/manifest-field-action.md)         |
| Use one safe provider-owned runner route            | [Runner Field Action](./examples/runner-field-action.md)             |
| Add a runner-backed dashboard action                | [Runner Dashboard Action](./examples/runner-dashboard-action.md)     |
| Collect a few scalar inputs before submit           | [Inline Form Action](./examples/inline-form-action.md)               |
| Target a host-provided nested row                   | [Row Target Action](./examples/row-target-action.md)                 |
| Add a dashboard action                              | [Dashboard Action](./examples/dashboard-action.md)                   |
| Return clipboard, open, download, or reload effects | [Response effect examples](./examples/README.md)                     |
| Show a Kumo toast                                   | [Toast Notification](./examples/toast-notification.md)               |
| Patch a clicked button after success                | [Action Patch](./examples/action-patch.md)                           |
| Poll long-running work                              | [Async Job](./examples/async-job.md)                                 |
| Run the provider in a sandbox                       | [Sandboxed Provider](./examples/sandboxed-provider.md)               |

The full recipe index is in [examples](./examples/README.md).

## Core Concepts

### Surfaces

- `actions:button`: field widget for content forms. It supports `clipboard`
  mode for browser-native copying and `run` mode for provider-backed actions.
- `Actions`: dashboard widget for provider/global actions. It reads configured
  provider manifests and renders matching action buttons.

### Action Labels And Icons

Every action must have a human-readable `label`. The action `label` is the
user-facing command text for the rendered button. `icon` is optional decoration
only; it must not be the only visible affordance for the action.

Field labels and action labels describe different things. The collection field
`label` names the field or slot, while the manifest action `label` or field
`options.label` names the command the button runs. They may match, but the
button still renders the resolved action label as visible text.

Idle buttons show the resolved action label. The button `title`, tooltip text,
and `aria-label` use that same resolved label. Feedback, progress, success, and
error text may temporarily replace or supplement the label after interaction,
but the idle state should always remain clear.

### Providers And Manifests

A provider manifest describes buttons:

```ts
{
  actions: [
    {
      id: "cache.clear",
      label: "Clear cache",
      route: "cache/clear",
      method: "POST",
      placement: "dashboard",
    },
  ],
}
```

Use clear labels for every action surface:

```ts
{
  actions: [
    {
      id: "cache.clear",
      label: "Clear cache",
      route: "cache/clear",
      method: "POST",
      placement: "dashboard",
      target: { surfaces: ["dashboard"] },
      icon: "bolt",
    },
    {
      id: "entry.rebuild",
      label: "Rebuild entry",
      runner: { route: "actions/run-entry" },
      placement: "entry",
      target: { surfaces: ["entry"], idFrom: "entryId" },
      icon: "refresh",
    },
    {
      id: "field.summarize",
      label: "Summarize field",
      runner: true,
      placement: "field",
      target: { surfaces: ["field"], idFrom: "entryId" },
      icon: "bolt",
    },
    {
      id: "row.translate",
      label: "Translate row",
      runner: true,
      placement: "field",
      target: { surfaces: ["row"], idFrom: "rowId" },
      icon: "repeat",
    },
  ],
}
```

`emdash-actions` loads the manifest from a provider route such as:

```txt
GET /_emdash/api/plugins/cache-actions/actions
```

Clicking the action calls the manifest route target:

```txt
POST /_emdash/api/plugins/cache-actions/cache/clear
```

Field buttons can also skip the manifest and call a direct route from field
options. Dashboard discovery uses `actionsPlugin({ providers })`.

Manifest actions can also use runner mode:

```ts
{
  actions: [
    {
      id: "field.summarize",
      runner: true,
      label: "Summarize",
      placement: "field",
      target: { surfaces: ["field"], idFrom: "entryId" },
      payload: { format: "short" },
      form: {
        mode: "inline",
        fields: [{ name: "format", type: "select", options: ["short", "long"] }],
      },
    },
  ],
}
```

Runner actions always call the provider-owned runner route, defaulting to:

```txt
POST /_emdash/api/plugins/<provider>/.well-known/actions/run
```

with a normalized invocation:

```json
{
  "invocationId": "inv_...",
  "actionId": "field.summarize",
  "payload": {
    "format": "long"
  },
  "target": {
    "type": "field",
    "surface": "field",
    "collection": "posts",
    "entryId": "post-1",
    "fieldName": "summary",
    "value": "Current field value"
  }
}
```

Use direct route mode when the browser should call one explicit provider route
such as `field/slugify`. Use runner mode when the provider should keep a fixed
server-side action registry and avoid exposing one callable route per button.
Runner providers must treat `actionId` as an identifier only, look it up in that
registry, authorize it server-side, and re-read target documents before mutating
content or protected state.

Runner actions may use the provider default runner route or override it per
action:

```ts
{ id: "entry.rebuild", runner: { route: "actions/run-entry" }, label: "Rebuild" }
```

`payload` is only static action input defaults. Inline `form` values and field
option payload values are merged into the request payload at submit time, and
user-provided form values win over defaults. `context` and `target` stay
top-level in runner invocations.

`target.idFrom` and `target.idKeys` can produce client-side missing-target
warnings before a request is sent. They are ergonomics only: provider runners
must re-read and validate the authoritative target server-side.

> [!IMPORTANT]
> Field JSON belongs in the target collection schema's `fields` array. It does
> not go inside `actionsPlugin()` or `astro.config.mjs`.

> [!WARNING]
> Provider routes must be relative plugin routes such as `cache/clear` or
> `.well-known/actions`. Absolute URLs, query strings, hashes, encoded paths,
> traversal segments, spaces, and backslashes are rejected.

### Action Responses

Provider routes return JSON that controls the clicked button and optional browser
effects:

- `message`, `severity`, `color`, `backgroundColor`, and `borderColor` drive
  temporary inline feedback.
- `action` patches the stable clicked button descriptor, useful for toggles.
- `effects` or top-level aliases can run `clipboard`, `open`, `download`, and
  `reload`.
- `effects.reload` accepts `true` or `{ scope, delayMs }`, where `scope` is
  `field`, `entry`, `dashboard`, or `page`. Scoped reloads dispatch the
  cancelable `emdash-actions:reload` browser event so hosts can refresh a
  narrower surface; if unhandled, they fall back to a page reload.
- `toast` shows a Kumo toast.
- `status: 202`, `jobStatus`, and `statusRoute` start async polling.
- An action result body with `status: 409`, `severity: "warning"`, and a reload
  effect is the canonical stale-target conflict result. Return this as the
  normal JSON action response body so the widget can run result effects.
- `resultValueKey` on a field button can write a returned value back into the
  field.

See the focused response recipes for complete payloads:
[Clipboard Effect](./examples/clipboard-effect.md),
[Open Effect](./examples/open-effect.md),
[Download Effect](./examples/download-effect.md),
[Toast Notification](./examples/toast-notification.md),
[Feedback And Colors](./examples/feedback-and-colors.md),
[Action Patch](./examples/action-patch.md), and
[Async Job](./examples/async-job.md).

### Entry Context

Field buttons can use inferred entry context. For direct-route actions,
`contextKey` and `contextValueKey` merge that context into the flat request
payload for compatibility. Runner actions keep the same context top-level in the
`ActionInvocation` body instead of hiding it inside `payload`.

Without a host-provided field-widget context, the plugin infers what it can from
the admin route and saved EmDash APIs: collection, entry id, new/edit state,
field name, current field value, saved entry data, and current user when
available.

> [!WARNING]
> Entry context is best-effort. It cannot infer live unsaved values from sibling
> fields. Pass the current field value with `valueKey`, use static `payload`, or
> have the provider read the latest saved entry server-side.

### Provider Formats

`emdash-actions` is a native EmDash UI plugin and belongs in `plugins: []`.
Provider plugins can use different formats:

- Native providers use `definePlugin()` from `emdash` and receive one merged
  `RouteContext` argument.
- Standard trusted providers can expose the same manifest and routes in
  `plugins: []`.
- Standard sandboxed providers export a `SandboxedPlugin` route map, run in
  `sandboxed: []`, and receive `(routeCtx, ctx)`.

See [Sandboxed Provider](./examples/sandboxed-provider.md) for the sandboxed
shape and caveats.

## Configuration At A Glance

### `actionsPlugin()` Options

- `providers`: provider plugins the dashboard widget should discover.
- `placement`: dashboard manifest placement to render. Defaults to `dashboard`.
  Set to `null` to show all placements.
- `title`: dashboard widget title. Defaults to `Actions`.
- `size`: dashboard widget size, `full`, `half`, or `third`.
- `entrypoint` and `adminEntry`: advanced descriptor overrides.

### Provider Options

- `pluginId`: provider plugin id.
- `label`: human-readable provider label. This names the provider, not an
  action button.
- `manifestRoute`: provider route that returns the manifest. Defaults to
  `.well-known/actions`.
- `runnerRoute`: provider route for `runner` actions. Defaults to
  `.well-known/actions/run`.
- `allowedTargetPluginIds`: cross-plugin route targets this provider may call.

### Field Button Options

The most common field options are:

- `mode`: `clipboard` or `run`.
- `provider` or `pluginId`: provider plugin id.
- `route`: direct provider route.
- `action`: provider manifest action id.
- `label`: field-local button command text. With `action`, this overrides the
  manifest action label for this field. Without it, manifest-backed buttons use
  the manifest action label.
- `description`, `icon`, `tone`, `confirm`: button UI. `icon` is optional
  decoration and the text label still renders.
- `payload`: static JSON body values.
- `valueKey`: include the current field value in the request body.
- `contextKey` and `contextValueKey`: include inferred context in direct-route
  payloads. Runner actions receive context top-level.
- `resultValueKey`: write a returned result value back into the field.
- `clipboardText`, `clipboardValueKey`, `clipboardContextValueKey`,
  `clipboardSuccess`: clipboard mode.
- `feedback`, `buttonStyle`, `cooldownMs`: temporary feedback and styling.
- `resultEffect`, `pollIntervalMs`, `pollTimeoutMs`: response shortcuts and
  async polling.

The exported TypeScript contracts live in [src/types.ts](./src/types.ts).

## Special Cases

> [!NOTE]
> Clipboard mode uses `navigator.clipboard.writeText()` in the browser. It does
> not call the backend, and browsers require HTTPS or localhost plus clipboard
> permission.

> [!CAUTION]
> Use `confirm` for destructive dashboard actions such as cache clearing,
> maintenance toggles, deploys, exports, or purge operations.

- Direct field routes can specify `options.provider` and `options.route` in the
  field JSON. They do not need to be listed in `actionsPlugin({ providers })`
  unless the dashboard should discover them too.
- Cross-plugin target routes require `allowedTargetPluginIds`; otherwise a
  provider manifest can only target its own plugin id.
- `DELETE` actions do not receive a JSON body, so payload, value, and context
  keys are useful with `POST`, `PUT`, and `PATCH`.
- Protected downloads can use `effects.download.route` to fetch through the
  action target plugin with EmDash auth headers. Sandboxed providers should
  prefer public or signed URLs for binary downloads, or delegate streaming to a
  trusted native route.
- Async jobs need a provider-owned `statusRoute`. Without one, the widget can
  show that work was accepted but cannot infer queued, running, failed, or
  completed state.

## Development

```sh
npm ci
npm run check
npm run typecheck
npm run build
npm run pack:check
```
