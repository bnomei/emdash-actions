# Feedback And Colors

Use `feedback` for temporary progress, success, and error labels. Use
`buttonStyle` for the resting button color, and response color fields for the
temporary terminal feedback color.

The resting button still needs a clear action label. Feedback text may
temporarily replace it after the editor clicks the button.

## Files Used

- `src/emdash/quality-actions.ts`: define the provider plugin, manifest route,
  and backend action route.
- `astro.config.mjs`: register `actionsPlugin()` and `qualityActions()` in the
  EmDash plugin list. Add `quality-actions` to `actionsPlugin({ providers })` if
  you want the dashboard to discover it too.
- Target collection schema file, for example `seed/schema.ts`,
  `seed/site.seed.json`, or the project-local script that defines EmDash
  collections. Add the field object to that collection's `fields` array.

## Backend Code

Create this provider module at `src/emdash/quality-actions.ts`:

```ts
// src/emdash/quality-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function qualityActions() {
  return definePlugin({
    id: "quality-actions",
    version: "0.1.0",
    routes: {
      actions: {
        handler: qualityActionsManifestRoute,
      },
      "quality/check": {
        handler: qualityCheckRoute,
      },
    },
  });
}

async function qualityActionsManifestRoute(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "quality.check",
        label: "Run quality check",
        route: "quality/check",
        method: "POST",
        placement: "field",
        icon: "warning",
        tone: "info",
        buttonStyle: {
          color: "var(--color-purple-800)",
          backgroundColor: "var(--color-purple-400)",
        },
        feedback: {
          progress: "Checking...",
          success: "Looks good.",
          error: "Needs work.",
        },
      },
    ],
  });
}

async function qualityCheckRoute(ctx: RouteContext) {
  const serverTime = new Date().toISOString();
  const hour = new Date(serverTime).getUTCHours();
  const isBusinessHours = hour >= 8 && hour < 18;

  ctx.log.info("Quality check action completed", {
    isBusinessHours,
    serverTime,
  });

  return {
    ok: true,
    status: 200,
    severity: isBusinessHours ? "success" : "info",
    message: isBusinessHours
      ? "Quality check passed during business hours."
      : "Quality check passed outside business hours.",
    color: isBusinessHours ? "var(--color-blue-700)" : "var(--color-purple-800)",
    backgroundColor: isBusinessHours ? "var(--color-blue-100)" : "var(--color-purple-100)",
    borderColor: isBusinessHours ? "var(--color-blue-400)" : "var(--color-purple-400)",
    serverTime,
  };
}
```

## Field JSON

Put this object inside the target collection schema's `fields` array, for
example in a seed JSON file or a project-local schema setup script.

```json
{
  "slug": "quality_action",
  "label": "Quality Action",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "quality-actions",
    "manifestRoute": "actions",
    "action": "quality.check",
    "label": "Run quality check"
  }
}
```

## Frontend Behavior

The resting button uses `buttonStyle`. During the request, it shows the progress
label. After success, the returned `message`, `color`, `backgroundColor`, and
`borderColor` are applied as temporary feedback. The button resets after
`cooldownMs`.

The response color is calculated on the server from the current UTC hour. In a
real provider, this is where you would inspect content, call a private service,
or compute validation results before returning feedback.
