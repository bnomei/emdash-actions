# Sandboxed Provider

`emdash-actions` itself is a native EmDash UI plugin because it registers admin
field and dashboard widgets. The provider that does the work behind a button can
be native or sandboxed. The action surface only needs provider API routes.

Use a sandboxed provider when the action implementation should run in an
isolated EmDash plugin sandbox. The manifest shape and field JSON stay the same;
only the provider authoring and `astro.config.mjs` registration change.

## Files Used

- `astro.config.mjs`: register `actionsPlugin()` in `plugins: []`, register the
  standard-format provider descriptor in `sandboxed: []`, and configure a
  `sandboxRunner`.
- Provider package entrypoint, for example
  `@acme/emdash-sandbox-time-actions`: default-export a standard-format plugin
  object with `routes`.
- Target collection schema file if the action is used from a field. Add the
  field object to that collection's `fields` array.

## Astro Config

Put `actionsPlugin()` in `plugins: []`. Put the standard-format provider in
`sandboxed: []`. The `pluginId` in the action provider config must match the
sandboxed descriptor `id`.

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionsPlugin } from "@bnomei/emdash-actions";

const sandboxTimeActionsProvider = {
  pluginId: "sandbox-time-actions",
  label: "Sandbox time actions",
  manifestRoute: "actions",
};

const sandboxTimeActions = {
  id: "sandbox-time-actions",
  version: "0.1.0",
  format: "standard",
  entrypoint: "@acme/emdash-sandbox-time-actions",
  capabilities: [],
};

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        actionsPlugin({
          providers: [sandboxTimeActionsProvider],
        }),
      ],
      sandboxed: [sandboxTimeActions],
      sandboxRunner: "@emdash-cms/sandbox-cloudflare",
    }),
  ],
});
```

Sandboxed entrypoints must resolve to built JavaScript, not local unbuilt
TypeScript source. Build and export the provider package before the site build.

## Backend Code

Sandboxed providers do not call `definePlugin()`. Identity, version,
capabilities, storage, and allowed hosts come from the descriptor in
`astro.config.mjs` or the installed plugin manifest. The provider default export
is a bare standard-format object typed with `SandboxedPlugin`.

Create this in the provider package entrypoint, for example
`src/index.ts` before building it to `dist/index.mjs`:

```ts
// src/index.ts in @acme/emdash-sandbox-time-actions
import type { SandboxedPlugin } from "emdash/plugin";
import type { ActionsManifest } from "@bnomei/emdash-actions";

export default {
  routes: {
    actions: async (_routeCtx, ctx): Promise<ActionsManifest> => {
      const lastRunAt = await ctx.kv.get<string>("state:lastRunAt");

      return {
        actions: [
          {
            id: "time.copyServerTime",
            label: lastRunAt ? "Copy server time again" : "Copy server time",
            route: "time/server-time",
            method: "POST",
            placement: "field",
            icon: "clipboard",
            tone: "info",
            description: lastRunAt
              ? `Last generated at ${lastRunAt}.`
              : `Runs inside the ${ctx.site.name} plugin sandbox.`,
          },
        ],
      };
    },

    "time/server-time": async (routeCtx, ctx) => {
      const serverTime = new Date().toISOString();
      await ctx.kv.set("state:lastRunAt", serverTime);
      ctx.log.info("Sandboxed time action ran", {
        pluginId: ctx.plugin.id,
        method: routeCtx.request.method,
        serverTime,
      });

      return {
        ok: true,
        status: 200,
        severity: "success",
        message: `Sandboxed provider generated ${serverTime}.`,
        effects: {
          clipboard: {
            text: serverTime,
          },
        },
        serverTime,
      };
    },
  },
} satisfies SandboxedPlugin;
```

## Field JSON

Put this object inside the target collection schema's `fields` array.

```json
{
  "slug": "sandbox_time_action",
  "label": "Sandbox Time Action",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "sandbox-time-actions",
    "manifestRoute": "actions",
    "action": "time.copyServerTime",
    "label": "Copy server time"
  }
}
```

## Frontend Behavior

The field button loads:

```txt
GET /_emdash/api/plugins/sandbox-time-actions/actions
```

It renders `Copy server time`. Clicking the button calls:

```txt
POST /_emdash/api/plugins/sandbox-time-actions/time/server-time
```

The route runs in the sandbox, writes `state:lastRunAt` through `ctx.kv`, logs
through `ctx.log`, returns the server timestamp, and the browser copies that
timestamp through `effects.clipboard`.

## Native Versus Sandboxed

- Native providers use `definePlugin()` from `emdash` and receive one merged
  `RouteContext` argument: `handler: async (ctx) => { ... }`.
- Sandboxed providers use `export default { routes } satisfies SandboxedPlugin`
  from `emdash/plugin` and receive two arguments:
  `handler: async (routeCtx, ctx) => { ... }`.
- Standard-format sandboxed providers can use capability-gated APIs such as
  `ctx.content`, `ctx.media`, `ctx.http`, and `ctx.users` only when the
  descriptor declares the matching capability.
- Sandboxed providers should return serializable action JSON. For raw binary
  downloads, prefer returning a public or signed URL via `effects.download.url`,
  or use a trusted native provider route when the file must stream through the
  provider.
- Native plugins cannot be placed in `sandboxed: []`. Convert the provider to
  standard format first.
