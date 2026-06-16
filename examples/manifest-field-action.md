# Manifest Field Action

Use a manifest action when the provider should own the action label, route,
icon, tone, confirmation prompt, feedback, or polling settings.

## Files Used

- `src/emdash/title-actions.ts`: define the provider plugin, manifest route, and
  backend action route.
- `astro.config.mjs`: register `actionsPlugin()` and `titleActions()` in the
  EmDash plugin list. Add `title-actions` to `actionsPlugin({ providers })` if
  you want the dashboard to discover it too.
- Target collection schema file, for example `seed/schema.ts`,
  `seed/site.seed.json`, or the project-local script that defines EmDash
  collections. Add the field object to that collection's `fields` array.

## Backend Code

Expose a manifest route and the action route on the provider plugin:

Create this provider module at `src/emdash/title-actions.ts`:

```ts
// src/emdash/title-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function titleActions() {
  return definePlugin({
    id: "title-actions",
    version: "0.1.0",
    capabilities: ["content:read"],
    routes: {
      actions: {
        handler: titleActionsManifestRoute,
      },
      "field/normalize-title": {
        handler: normalizeTitleRoute,
      },
    },
  });
}

async function titleActionsManifestRoute(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "field.normalizeTitle",
        label: "Normalize title",
        route: "field/normalize-title",
        method: "POST",
        placement: "field",
        description: "Converts the current title to title case.",
        icon: "bolt",
        tone: "info",
        contextKey: "context",
        feedback: {
          progress: "Normalizing...",
          success: "Title normalized.",
          error: "Title normalization failed.",
        },
      },
    ],
  });
}

async function normalizeTitleRoute(ctx: RouteContext) {
  const payload = (await ctx.request.json().catch(() => ({}))) as {
    value?: unknown;
    context?: {
      collection?: string;
      entryId?: string;
    };
  };
  const serverTime = new Date().toISOString();
  const savedEntry =
    ctx.content && payload.context?.collection && payload.context.entryId
      ? await ctx.content.get(payload.context.collection, payload.context.entryId)
      : null;
  const title = String(payload.value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  ctx.log.info("Normalized title field action", {
    entryId: savedEntry?.id ?? payload.context?.entryId,
    collection: payload.context?.collection,
    serverTime,
  });

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: savedEntry
      ? `Title normalized for saved entry ${savedEntry.id}.`
      : `Title normalized on the server at ${serverTime}.`,
    title,
    serverTime,
  };
}
```

## Field JSON

Put this object inside the target collection schema's `fields` array, for
example in a seed JSON file or a project-local schema setup script.

```json
{
  "slug": "title",
  "label": "Title",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "title-actions",
    "manifestRoute": "actions",
    "action": "field.normalizeTitle",
    "valueKey": "value",
    "resultValueKey": "title"
  }
}
```

## Frontend Behavior

The button first loads:

```txt
GET /_emdash/api/plugins/title-actions/actions
```

It finds `field.normalizeTitle`, renders the provider-owned label and styling,
then calls:

```txt
POST /_emdash/api/plugins/title-actions/field/normalize-title
```

The route returns `title`, and the widget writes that value back into the field.

The provider declares `capabilities: ["content:read"]`, so the route can use
`ctx.content` to inspect the saved EmDash entry when field context includes a
collection and entry id. The current field value still comes from the button
payload.
