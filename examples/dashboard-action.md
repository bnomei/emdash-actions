# Dashboard Action

Use a dashboard action when the button is global to the site or provider rather
than tied to one content field.

## Files Used

- `astro.config.mjs`: register `actionsPlugin({ providers })` with the
  `cache-actions` provider and register `cacheActions()` in the EmDash plugin
  list.
- `src/emdash/cache-actions.ts`: define the provider plugin, manifest route, and
  backend action route.
- No collection field schema is needed for dashboard-only actions.

## Astro Config

Dashboard actions are discovered from `actionsPlugin({ providers })`:

Put this inside the EmDash plugin configuration in `astro.config.mjs`:

```ts
actionsPlugin({
  title: "Actions",
  size: "half",
  placement: "dashboard",
  providers: [
    {
      pluginId: "cache-actions",
      label: "Cache actions",
      manifestRoute: "actions",
    },
  ],
});
```

## Backend Code

Create this provider module at `src/emdash/cache-actions.ts`:

```ts
// src/emdash/cache-actions.ts
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
        description: "Clears the site cache.",
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
    clearCount,
    toast: {
      type: "success",
      title: "Cache cleared",
      message: `${ctx.site.name} cache has been cleared ${clearCount} time(s).`,
    },
  };
}

async function clearSiteCache(ctx: RouteContext) {
  // Clear your cache provider here. This runs in the EmDash backend, so it can
  // call private SDKs, read env vars, or invalidate deployment-specific caches.
  await ctx.kv.set("state:lastClearedAt", new Date().toISOString());
}
```

## Frontend Behavior

The dashboard widget renders `Clear cache`. Clicking it asks for confirmation,
calls `POST /_emdash/api/plugins/cache-actions/cache/clear`, shows inline success
feedback, and displays the toast from the response.

The route is backend TypeScript. It persists a counter through `ctx.kv`, logs
with `ctx.log`, and can call private cache APIs from `clearSiteCache()`.
