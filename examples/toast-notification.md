# Toast Notification

Use `toast` when the action should show a Kumo toast in addition to inline button
feedback.

## Files Used

- `src/emdash/toast-actions.ts`: define the provider plugin and backend action
  route.
- `astro.config.mjs`: register both `actionsPlugin()` and `toastActions()` in
  the EmDash plugin list.
- Target collection schema file, for example `seed/schema.ts`,
  `seed/site.seed.json`, or the project-local script that defines EmDash
  collections. Add the field object to that collection's `fields` array.

## Backend Code

Create this provider module at `src/emdash/toast-actions.ts`:

```ts
// src/emdash/toast-actions.ts
import { definePlugin, type RouteContext } from "emdash";

export function toastActions() {
  return definePlugin({
    id: "toast-actions",
    version: "0.1.0",
    routes: {
      "notifications/test-toast": {
        handler: testToastRoute,
      },
    },
  });
}

async function testToastRoute(ctx: RouteContext) {
  const serverTime = new Date().toISOString();
  const count = ((await ctx.kv.get<number>("state:toastCount")) ?? 0) + 1;
  await ctx.kv.set("state:toastCount", count);

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: `Toast generated on the server at ${serverTime}.`,
    toast: {
      type: "success",
      title: "Action complete",
      message: `The provider has shown ${count} toast notification(s).`,
    },
    serverTime,
  };
}
```

## Field JSON

Put this object inside the target collection schema's `fields` array, for
example in a seed JSON file or a project-local schema setup script.

This example uses a direct route instead of a manifest action:

```json
{
  "slug": "toast_action",
  "label": "Toast Action",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "toast-actions",
    "route": "notifications/test-toast",
    "method": "POST",
    "label": "Show toast",
    "icon": "check",
    "tone": "positive"
  }
}
```

## Frontend Behavior

Clicking `Show toast` calls the provider route. The button temporarily shows
the backend `message` value, including the server timestamp, and the admin
renders the toast with the configured title and message.

`toast` can be a single object, an array of toast objects, or `false`.

The toast content is backend output. This route increments a plugin-local counter
with `ctx.kv` and returns the updated count in the toast message.
