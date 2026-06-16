# Open Effect

Use an open effect when the backend decides which URL the editor should visit.

## Files Used

- `src/emdash/media-shortcut-actions.ts`: define the provider plugin, manifest
  route, and backend action route.
- `astro.config.mjs`: register `actionsPlugin()` and `mediaShortcutActions()` in
  the EmDash plugin list. Add `media-shortcut-actions` to
  `actionsPlugin({ providers })` if you want the dashboard to discover it too.
- Target collection schema file, for example `seed/schema.ts`,
  `seed/site.seed.json`, or the project-local script that defines EmDash
  collections. Add the field object to that collection's `fields` array.

## Backend Code

Create this provider module at `src/emdash/media-shortcut-actions.ts`:

```ts
// src/emdash/media-shortcut-actions.ts
import { definePlugin, type RouteContext } from "emdash";
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export function mediaShortcutActions() {
  return definePlugin({
    id: "media-shortcut-actions",
    version: "0.1.0",
    routes: {
      actions: {
        handler: mediaShortcutActionsManifestRoute,
      },
      "admin/open-media": {
        handler: openMediaRoute,
      },
    },
  });
}

async function mediaShortcutActionsManifestRoute(): Promise<ActionsManifest> {
  return defineActionsManifest({
    actions: [
      {
        id: "admin.openMedia",
        label: "Open media library",
        route: "admin/open-media",
        method: "POST",
        placement: "field",
        icon: "power",
        tone: "info",
      },
    ],
  });
}

async function openMediaRoute(ctx: RouteContext) {
  const serverTime = new Date().toISOString();
  const adminMediaUrl = ctx.url("/_emdash/admin/media");

  ctx.log.info("Opening media library from action", {
    adminMediaUrl,
    serverTime,
  });

  return {
    ok: true,
    status: 200,
    severity: "info",
    message: `Opening media library selected by the server at ${serverTime}.`,
    effects: {
      open: {
        url: adminMediaUrl,
        target: "blank",
      },
    },
  };
}
```

## Field JSON

Put this object inside the target collection schema's `fields` array, for
example in a seed JSON file or a project-local schema setup script.

```json
{
  "slug": "media_shortcut",
  "label": "Media Shortcut",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "run",
    "provider": "media-shortcut-actions",
    "manifestRoute": "actions",
    "action": "admin.openMedia"
  }
}
```

## Frontend Behavior

The button calls the provider route and then opens `/_emdash/admin/media` in a
new tab. Use `"target": "self"` when the current admin tab should navigate
instead.

The URL is chosen on the server. The route can branch on `ctx.site`,
`ctx.requestMeta`, plugin settings in `ctx.kv`, or any private backend state
before returning the `effects.open` payload.
