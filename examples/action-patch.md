# Action Patch

Use `action` in the response when a successful click should update the clicked
button's stable descriptor. This is useful for toggles such as maintenance mode.

## Files Used

- `src/emdash/maintenance-actions.ts`: define the provider plugin, manifest
  route, and backend action route.
- `astro.config.mjs`: register `actionsPlugin({ providers })` with the
  `maintenance-actions` provider and register `maintenanceActions()` in the
  EmDash plugin list.
- No collection field schema is needed for this dashboard action example.

## Backend Code

Create this provider module at `src/emdash/maintenance-actions.ts`:

```ts
// src/emdash/maintenance-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function maintenanceActions() {
  return definePlugin({
    id: "maintenance-actions",
    version: "0.1.0",
    routes: {
      actions: {
        handler: maintenanceActionsManifestRoute,
      },
      "maintenance/toggle": {
        handler: toggleMaintenanceRoute,
      },
    },
  });
}

async function maintenanceActionsManifestRoute(ctx: RouteContext): Promise<ActionsManifest> {
  const maintenanceEnabled = await readMaintenanceEnabled(ctx);

  return defineActionsManifest({
    actions: [
      {
        id: "maintenance.toggle",
        label: maintenanceEnabled ? "Disable maintenance mode" : "Enable maintenance mode",
        route: "maintenance/toggle",
        method: "POST",
        placement: "dashboard",
        icon: "power",
        tone: maintenanceEnabled ? "danger" : "positive",
        confirm: maintenanceEnabled ? "Disable maintenance mode?" : "Enable maintenance mode?",
      },
    ],
  });
}

async function toggleMaintenanceRoute(ctx: RouteContext) {
  const maintenanceEnabled = !(await readMaintenanceEnabled(ctx));
  const serverTime = new Date().toISOString();
  await ctx.kv.set("state:maintenanceEnabled", maintenanceEnabled);
  await ctx.kv.set("state:maintenanceToggledAt", serverTime);

  ctx.log.info("Maintenance mode toggled", {
    maintenanceEnabled,
    serverTime,
  });

  return {
    ok: true,
    status: 200,
    severity: "success",
    message: maintenanceEnabled ? "Maintenance mode enabled." : "Maintenance mode disabled.",
    action: {
      label: maintenanceEnabled ? "Disable maintenance mode" : "Enable maintenance mode",
      icon: "power",
      tone: maintenanceEnabled ? "danger" : "positive",
      confirm: maintenanceEnabled ? "Disable maintenance mode?" : "Enable maintenance mode?",
    },
    serverTime,
  };
}

async function readMaintenanceEnabled(ctx: RouteContext) {
  return (await ctx.kv.get<boolean>("state:maintenanceEnabled")) ?? false;
}
```

## Dashboard JSON

The dashboard gets this action from the provider manifest:

This JSON is returned by the provider's manifest route. It is not pasted into a
collection schema.

```json
{
  "id": "maintenance.toggle",
  "label": "Enable maintenance mode",
  "route": "maintenance/toggle",
  "method": "POST",
  "placement": "dashboard",
  "icon": "power",
  "tone": "positive",
  "confirm": "Enable maintenance mode?"
}
```

## Frontend Behavior

After a successful click, the widget merges `response.action` into the clicked
button. The new label, icon, tone, and confirmation prompt stay visible until
the dashboard reloads.

The provider manifest should also read persisted state and return the current
label. That keeps a full dashboard reload consistent with the last action
result.

Both the manifest route and toggle route run on the server. They use `ctx.kv` as
plugin-local state, so the manifest can return the correct label after a full
dashboard reload.
