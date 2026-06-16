# Async Job

Use an accepted result with `statusRoute` when the provider starts work that
cannot finish during the first request.

## Files Used

- `src/emdash/export-job-actions.ts`: define the provider plugin, manifest
  route, start route, and polling status route.
- `astro.config.mjs`: register `actionsPlugin({ providers })` with the
  `export-job-actions` provider and register `exportJobActions()` in the EmDash
  plugin list.
- No collection field schema is needed for this dashboard action example.

## Backend Code

Create this provider module at `src/emdash/export-job-actions.ts`:

```ts
// src/emdash/export-job-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function exportJobActions() {
  return definePlugin({
    id: "export-job-actions",
    version: "0.1.0",
    capabilities: ["content:read"],
    routes: {
      actions: {
        handler: exportJobActionsManifestRoute,
      },
      "jobs/start-export": {
        handler: startExportRoute,
      },
      "jobs/export-status": {
        handler: exportStatusRoute,
      },
    },
  });
}

async function exportJobActionsManifestRoute(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "exports.start",
        label: "Start export",
        route: "jobs/start-export",
        method: "POST",
        placement: "dashboard",
        icon: "lightning",
        tone: "info",
        resultMode: "emdash-action-accepted-v1",
        pollIntervalMs: 1500,
        pollTimeoutMs: 120000,
      },
    ],
  });
}

async function startExportRoute(ctx: RouteContext) {
  const startedAt = new Date().toISOString();
  const jobId = "latest-export";
  await ctx.kv.set(`state:job:${jobId}`, {
    startedAt,
    status: "running",
  });

  ctx.log.info("Started export job", { jobId, startedAt });

  return {
    ok: true,
    status: 202,
    jobId,
    jobStatus: "accepted",
    statusRoute: "jobs/export-status",
    message: "Export accepted.",
    pollAfterMs: 1500,
  };
}

async function exportStatusRoute(ctx: RouteContext) {
  const jobId = "latest-export";
  const jobState = await ctx.kv.get<{ startedAt: string; status: string }>(`state:job:${jobId}`);
  const entries = ctx.content
    ? await ctx.content.list("posts", { limit: 10, orderBy: { updatedAt: "desc" } })
    : { items: [] };
  const completedAt = new Date().toISOString();

  return {
    ok: true,
    status: 200,
    jobId,
    jobStatus: "succeeded",
    progress: 1,
    message: `Export complete for ${entries.items.length} sampled post(s).`,
    startedAt: jobState?.startedAt,
    completedAt,
    toast: {
      type: "success",
      title: "Export complete",
      message: `The export job finished at ${completedAt}.`,
    },
  };
}
```

## Dashboard JSON

The dashboard gets this action from the provider manifest:

This JSON is returned by the provider's manifest route. It is not pasted into a
collection schema.

```json
{
  "id": "exports.start",
  "label": "Start export",
  "route": "jobs/start-export",
  "method": "POST",
  "placement": "dashboard",
  "resultMode": "emdash-action-accepted-v1",
  "pollIntervalMs": 1500,
  "pollTimeoutMs": 120000
}
```

## Frontend Behavior

The first click calls `jobs/start-export`. Because the response has
`status: 202`, `jobStatus: "accepted"`, and `statusRoute`, the button stays in a
loading state. The widget polls `jobs/export-status` until the route returns
`jobStatus: "succeeded"`, `failed`, or `cancelled`.

Pending statuses are `accepted`, `queued`, and `running`.

The start route and polling route are backend TypeScript. The start route writes
job state to `ctx.kv`; the status route reads that state, samples EmDash content
with `ctx.content`, and returns a terminal result when the work is done.
