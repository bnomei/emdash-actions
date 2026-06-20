# Runner Field Action

Use runner mode when a provider should own one safe action endpoint and resolve
`actionId` server-side instead of exposing one browser-callable route per field
button.

## Files Used

- `src/emdash/editor-actions.ts`: define the provider plugin, manifest route,
  fixed runner route, and server-side action registry.
- Target collection schema file. Add the field object to that collection's
  `fields` array.

## Backend Code

Expose a manifest route plus a fixed runner route. The default runner route is
`.well-known/actions/run`.

```ts
// src/emdash/editor-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import {
  defineActionsManifest,
  type ActionInvocation,
  type ActionRunResult,
  type ActionsManifest,
} from "@bnomei/emdash-actions";

const runnerRegistry = {
  "field.summarize": summarizeField,
} satisfies Record<
  string,
  (ctx: RouteContext, invocation: ActionInvocation) => Promise<ActionRunResult>
>;

export function editorActions() {
  return definePlugin({
    id: "editor-actions",
    version: "0.1.0",
    capabilities: ["content:read"],
    routes: {
      ".well-known/actions": {
        handler: editorActionsManifestRoute,
      },
      ".well-known/actions/run": {
        handler: editorActionsRunnerRoute,
      },
    },
  });
}

async function editorActionsManifestRoute(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "field.summarize",
        runner: true,
        label: "Summarize",
        placement: "field",
        description: "Summarizes the current field value.",
        icon: "bolt",
        tone: "info",
        payload: { format: "short" },
        target: {
          surfaces: ["field"],
          idFrom: "entryId",
        },
        form: {
          mode: "inline",
          fields: [{ name: "format", type: "string", required: false }],
        },
        feedback: {
          progress: "Summarizing...",
          success: "Summary ready.",
          error: "Summary failed.",
        },
      },
    ],
  });
}

async function editorActionsRunnerRoute(ctx: RouteContext) {
  const invocation = (await ctx.request.json().catch(() => ({}))) as ActionInvocation;
  const handler = runnerRegistry[invocation.actionId];
  if (!handler) {
    return { ok: false, status: 404, error: "Unknown action." };
  }
  return handler(ctx, invocation);
}

async function summarizeField(
  ctx: RouteContext,
  invocation: ActionInvocation,
): Promise<ActionRunResult> {
  const target = invocation.target?.type === "field" ? invocation.target : null;
  const savedEntry =
    ctx.content && target?.collection && target.entryId
      ? await ctx.content.get(target.collection, target.entryId)
      : null;
  const value = String(target?.value ?? "").trim();
  const summary = value.length > 80 ? `${value.slice(0, 77)}...` : value;

  ctx.log.info("Summarized field through provider runner", {
    actionId: invocation.actionId,
    collection: target?.collection,
    entryId: savedEntry?.id ?? target?.entryId,
  });

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: savedEntry
      ? `Summary prepared for saved entry ${savedEntry.id}.`
      : "Summary prepared.",
    summary,
  };
}
```

## Field JSON

```json
{
  "slug": "summary",
  "label": "Summary",
  "type": "text",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "editor-actions",
    "action": "field.summarize",
    "label": "Summarize",
    "payload": {
      "format": "short"
    },
    "resultValueKey": "summary"
  }
}
```

## Frontend Behavior

The button first loads:

```txt
GET /_emdash/api/plugins/editor-actions/.well-known/actions
```

It finds `field.summarize`, renders `Summarize` as the visible button label with
the provider-owned styling, then posts the normalized invocation to the fixed
runner route:

```txt
POST /_emdash/api/plugins/editor-actions/.well-known/actions/run
```

```json
{
  "invocationId": "inv_...",
  "actionId": "field.summarize",
  "payload": {
    "format": "short"
  },
  "target": {
    "type": "field",
    "surface": "field",
    "collection": "posts",
    "entryId": "post-1",
    "locale": "en",
    "fieldName": "summary",
    "value": "Current field value"
  }
}
```

The browser never chooses a business route in runner mode. The provider must
look up `actionId` in a fixed server-side registry and re-read target documents
server-side before mutating content or other protected state.
