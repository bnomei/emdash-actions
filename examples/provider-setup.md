# Provider Setup

Use this setup when an action button should call backend code or when the
dashboard widget should discover actions from a provider manifest.

Clipboard-only field buttons do not need a backend provider. They only need
`actionsPlugin()` registered so the `actions:button` field widget exists.

This recipe uses a native-format provider with `definePlugin()`. If the provider
should run in an EmDash plugin sandbox instead, use the standard-format shape in
[Sandboxed Provider](./sandboxed-provider.md).

## Files Used

- `astro.config.mjs`: register `actionsPlugin()` and the example provider
  plugin.
- `src/emdash/example-actions.ts`: define the provider plugin, manifest route,
  and backend action route.

## Astro Config

Register the action UI plugin and your provider plugin in the same EmDash plugin
list. The `pluginId` in `actionsPlugin({ providers })` must match the provider
plugin's `id`.

Put this in the project's `astro.config.mjs`:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionsPlugin } from "@bnomei/emdash-actions";
import { exampleActions } from "./src/emdash/example-actions";

const exampleActionsProvider = {
  pluginId: "example-actions",
  label: "Example actions",
  manifestRoute: "actions",
};

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        actionsPlugin({
          providers: [exampleActionsProvider],
          size: "half",
        }),
        exampleActions(),
      ],
    }),
  ],
});
```

For field-only buttons, the provider can also be declared directly in the field
JSON with `options.provider`. The `actionsPlugin({ providers })` list is what the
dashboard widget uses to discover provider actions.

## Provider Plugin

Expose one route that returns the action manifest and one route per action.
Keeping both `actions` and `.well-known/actions` is optional, but useful when a
project wants a short local route while still supporting the default manifest
route.

Create this provider module at `src/emdash/example-actions.ts`:

```ts
// src/emdash/example-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function exampleActions() {
  return definePlugin({
    id: "example-actions",
    version: "0.1.0",
    routes: {
      actions: {
        handler: exampleActionsManifestRoute,
      },
      ".well-known/actions": {
        handler: exampleActionsManifestRoute,
      },
      "tools/ping": {
        handler: pingRoute,
      },
    },
  });
}

async function exampleActionsManifestRoute(ctx: RouteContext): Promise<ActionsManifest> {
  const lastPingedAt = await ctx.kv.get<string>("state:lastPingedAt");

  return defineActionsManifest({
    actions: [
      {
        id: "tools.ping",
        label: lastPingedAt ? "Ping provider again" : "Ping provider",
        route: "tools/ping",
        method: "POST",
        placement: "dashboard",
        description: lastPingedAt
          ? `Last pinged at ${lastPingedAt}.`
          : `Runs on the ${ctx.site.name} server.`,
        icon: "check",
        tone: "info",
      },
    ],
  });
}

async function pingRoute(ctx: RouteContext) {
  const serverTime = new Date().toISOString();
  await ctx.kv.set("state:lastPingedAt", serverTime);
  ctx.log.info("Example action pinged", {
    pluginId: ctx.plugin.id,
    site: ctx.site.name,
    userAgent: ctx.requestMeta.userAgent,
  });

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: `Provider route ran on the server at ${serverTime}.`,
    serverTime,
    site: ctx.site.name,
  };
}
```

## Frontend Behavior

With the setup above, the dashboard widget loads:

```txt
GET /_emdash/api/plugins/example-actions/actions
```

It renders a `Ping provider` button. Clicking the button calls:

```txt
POST /_emdash/api/plugins/example-actions/tools/ping
```

The response message becomes temporary inline button feedback.

The `tools/ping` route is TypeScript backend code. It reads EmDash route context,
writes plugin state through `ctx.kv`, logs through `ctx.log`, and returns the
server timestamp from `new Date()`.
