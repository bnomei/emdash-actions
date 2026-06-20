# Runner Dashboard Action

Use a dashboard runner action when a provider owns a fixed action registry and
the button is not tied to one field.

## Manifest

```ts
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export async function actionsManifest(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "cache.clear",
        runner: true,
        label: "Clear cache",
        placement: "dashboard",
        tone: "warning",
        confirm: "Clear the site cache?",
        target: { surfaces: ["dashboard"] },
        payload: { scope: "site" },
      },
    ],
  });
}
```

## Runner Route

Register `.well-known/actions/run` on the provider plugin and resolve
`invocation.actionId` from a fixed registry:

```ts
import type { ActionInvocation, ActionRunResult } from "@bnomei/emdash-actions";
import type { RouteContext } from "emdash";

const registry = {
  "cache.clear": clearCache,
} satisfies Record<
  string,
  (ctx: RouteContext, invocation: ActionInvocation) => Promise<ActionRunResult>
>;

export async function actionsRunner(ctx: RouteContext) {
  const invocation = (await ctx.request.json()) as ActionInvocation;
  const handler = registry[invocation.actionId];
  if (!handler) return { ok: false, status: 404, error: "Unknown action." };
  return handler(ctx, invocation);
}

async function clearCache(ctx: RouteContext): Promise<ActionRunResult> {
  await ctx.kv.set("cache:lastClearedAt", new Date().toISOString());
  return {
    ok: true,
    status: 200,
    severity: "success",
    message: "Cache cleared.",
    effects: { reload: { scope: "dashboard" } },
  };
}
```

The browser posts to the provider runner route, not to a business route:

```txt
POST /_emdash/api/plugins/cache-actions/.well-known/actions/run
```
