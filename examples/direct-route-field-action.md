# Direct Route Field Action

Use a direct route when a field button should call one provider endpoint without
loading a manifest first.

## Files Used

- `src/emdash/slug-actions.ts`: define the provider plugin and backend route.
- `astro.config.mjs`: register both `actionsPlugin()` and `slugActions()` in the
  EmDash plugin list.
- Target collection schema file, for example `seed/schema.ts`,
  `seed/site.seed.json`, or the project-local script that defines EmDash
  collections. Add the field object to that collection's `fields` array.

## Backend Code

Register the route on a provider plugin:

Create this provider module at `src/emdash/slug-actions.ts`:

```ts
// src/emdash/slug-actions.ts
import { definePlugin, type RouteContext } from "emdash";

export function slugActions() {
  return definePlugin({
    id: "slug-actions",
    version: "0.1.0",
    routes: {
      "field/slugify": {
        handler: slugifyRoute,
      },
    },
  });
}

async function slugifyRoute(ctx: RouteContext) {
  const payload = (await ctx.request.json().catch(() => ({}))) as {
    value?: unknown;
  };
  const serverTime = new Date().toISOString();
  const source = String(payload.value ?? "");
  const slug = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  ctx.log.info("Generated slug from field action", {
    pluginId: ctx.plugin.id,
    site: ctx.site.name,
    sourceLength: source.length,
    serverTime,
  });

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: `Slug generated on the server at ${serverTime}.`,
    slug,
    serverTime,
  };
}
```

## Field JSON

Put this object inside the target collection schema's `fields` array, for
example in a seed JSON file or a project-local schema setup script.

```json
{
  "slug": "slug",
  "label": "Slug",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "slug-actions",
    "route": "field/slugify",
    "method": "POST",
    "label": "Generate slug",
    "valueKey": "value",
    "resultValueKey": "slug",
    "feedback": {
      "progress": "Generating...",
      "success": "Slug ready.",
      "error": "Slug failed."
    }
  }
}
```

## Frontend Behavior

Clicking `Generate slug` sends the current field value as:

```json
{
  "value": "Current field value"
}
```

to:

```txt
POST /_emdash/api/plugins/slug-actions/field/slugify
```

When the route returns `{ "slug": "current-field-value" }`, the widget writes
that value back into the same EmDash field because `resultValueKey` is `slug`.

The slug is not computed in the browser. The route handler runs in the EmDash
backend, reads the request body from `ctx.request`, writes a log entry through
`ctx.log`, and returns the server-generated value.
