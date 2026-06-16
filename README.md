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
vp install @bnomei/emdash-actions
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

| Goal                                                 | Start here                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Copy a value without backend code                    | [Clipboard Field Button](./examples/clipboard-field-button.md)       |
| Call one backend route from a field                  | [Direct Route Field Action](./examples/direct-route-field-action.md) |
| Let a provider own labels, icon, route, and feedback | [Manifest Field Action](./examples/manifest-field-action.md)         |
| Add a dashboard action                               | [Dashboard Action](./examples/dashboard-action.md)                   |
| Return clipboard, open, download, or reload effects  | [Response effect examples](./examples/README.md)                     |
| Show a Kumo toast                                    | [Toast Notification](./examples/toast-notification.md)               |
| Patch a clicked button after success                 | [Action Patch](./examples/action-patch.md)                           |
| Poll long-running work                               | [Async Job](./examples/async-job.md)                                 |
| Run the provider in a sandbox                        | [Sandboxed Provider](./examples/sandboxed-provider.md)               |

The full recipe index is in [examples](./examples/README.md).

## Core Concepts

### Surfaces

- `actions:button`: field widget for content forms. It supports `clipboard`
  mode for browser-native copying and `run` mode for provider-backed actions.
- `Actions`: dashboard widget for provider/global actions. It reads configured
  provider manifests and renders matching action buttons.

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
- `toast` shows a Kumo toast.
- `status: 202`, `jobStatus`, and `statusRoute` start async polling.
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

Field buttons can include inferred entry context in the action payload with
`contextKey` and `contextValueKey`. Without a host-provided field-widget context,
the plugin infers what it can from the admin route and saved EmDash APIs:
collection, entry id, new/edit state, field name, current field value, saved
entry data, and current user when available.

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
- `label`: human-readable provider label.
- `manifestRoute`: provider route that returns the manifest. Defaults to
  `.well-known/actions`.
- `allowedTargetPluginIds`: cross-plugin route targets this provider may call.

### Field Button Options

The most common field options are:

- `mode`: `clipboard` or `run`.
- `provider` or `pluginId`: provider plugin id.
- `route`: direct provider route.
- `action`: provider manifest action id.
- `label`, `description`, `icon`, `tone`, `confirm`: button UI.
- `payload`: static JSON body values.
- `valueKey`: include the current field value in the request body.
- `contextKey` and `contextValueKey`: include inferred context.
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
vp install
vp run typecheck
vp run build
vp run pack:check
```
