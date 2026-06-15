# @bnomei/emdash-actions

[![npm version](https://img.shields.io/npm/v/@bnomei/emdash-actions.svg)](https://www.npmjs.com/package/@bnomei/emdash-actions)
[![npm downloads](https://img.shields.io/npm/dm/@bnomei/emdash-actions.svg)](https://www.npmjs.com/package/@bnomei/emdash-actions)
[![license](https://img.shields.io/npm/l/@bnomei/emdash-actions.svg)](https://www.npmjs.com/package/@bnomei/emdash-actions)
[![types](https://img.shields.io/badge/types-included-blue.svg)](./package.json)
[![source](https://img.shields.io/badge/source-GitHub-181717.svg?logo=github)](https://github.com/bnomei/emdash-actions)

Action buttons for EmDash fields and dashboards.

`emdash-actions` is a native EmDash UI plugin for rendering configurable action buttons. The primary target is contextual field actions: a button inside a regular content form that can copy a value, call a provider endpoint, or write a returned value back into the field. The package also includes a dashboard widget for global site actions such as clearing caches, triggering rebuilds, toggling maintenance mode, starting exports, or kicking off serverless jobs.

The UI package owns the trigger surfaces. Provider plugins own the work behind those triggers. That keeps existing standard, native, or sandboxed plugins independent from this package: they can expose normal EmDash API routes, and `emdash-actions` can render buttons that call those routes.

## Surfaces

- `actions:button`: A field widget for content forms. This is the Janitor-like surface and the main reason for the package. It supports `run` mode for backend actions and `clipboard` mode for browser-native copy buttons.
- `Actions` dashboard widget: A dashboard surface for global/provider actions. It reads provider manifests and renders one button per matching action.

Field buttons become substantially more powerful with entry context. EmDash does not currently expose a stable field-widget context prop or global object, so `emdash-actions` uses a best-effort fallback: it reads the admin route, optionally fetches the saved entry and current user from EmDash APIs, and includes selected context in action payloads or clipboard values.

## Install

```sh
vp install @bnomei/emdash-actions
```

Register the UI plugin in your EmDash project. This goes in the Astro config file where your `emdash()` integration is configured:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionsPlugin } from "@bnomei/emdash-actions";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [actionsPlugin()],
    }),
  ],
});
```

This registers the `actions:button` field widget and the `Actions` dashboard widget. Clipboard field buttons work with only this registration.

Configure providers in the same `astro.config.mjs` plugin list when you want buttons to call backend routes or resolve manifest actions:

```ts
// astro.config.mjs
import { actionsPlugin } from "@bnomei/emdash-actions";

emdash({
  plugins: [
    actionsPlugin({
      providers: [
        {
          pluginId: "site-tools",
          label: "Site tools",
        },
      ],
    }),
  ],
});
```

## Field Button

Use `actions:button` when an action belongs next to a field in a content form. This is the best fit for contextual tools such as copying or generating an ID, syncing the current field value, refreshing derived metadata, or calling a provider endpoint from a specific content template.

Clipboard mode example. This object is a field definition inside the target collection schema, not an Astro integration option. Put it wherever your project creates or seeds EmDash fields, for example in a seed file exported from `emdash export-seed` or a project-local schema setup script:

```ts
// seed/schema.ts or seed.json
// Inside the target collection's fields array:
{
  slug: "newsletter_user_uuid",
  label: "Newsletter user UUID",
  type: "string",
  widget: "actions:button",
  options: {
    mode: "clipboard",
    label: "Copy UUID",
    clipboardSuccess: "UUID copied."
  }
}
```

Clipboard mode can also copy a configured literal value or a nested value from a `json` field. This is still a field definition in the collection schema:

```ts
// seed/schema.ts or seed.json
// Inside the target collection's fields array:
{
  slug: "newsletter_profile",
  label: "Newsletter profile",
  type: "json",
  widget: "actions:button",
  options: {
    mode: "clipboard",
    label: "Copy remote ID",
    clipboardValueKey: "remote.id"
  }
}
```

Run mode direct route example. Add this field definition to the collection that should show the button:

```ts
// seed/schema.ts or seed.json
// Inside the target collection's fields array:
{
  slug: "newsletter_user_uuid",
  label: "Newsletter user UUID",
  type: "string",
  widget: "actions:button",
  options: {
    mode: "run",
    pluginId: "newsletter-actions",
    route: "copy-user-uuid",
    method: "POST",
    label: "Copy UUID",
    valueKey: "currentValue",
    contextKey: "entryId",
    contextValueKey: "entryId",
    resultValueKey: "uuid"
  }
}
```

Run mode manifest action example. This is also a collection field definition; the button resolves one action from the provider manifest:

```ts
// seed/schema.ts or seed.json
// Inside the target collection's fields array:
{
  slug: "newsletter_user_uuid",
  label: "Newsletter user UUID",
  type: "string",
  widget: "actions:button",
  options: {
    mode: "run",
    provider: "newsletter-actions",
    action: "newsletter.copyUserUuid",
    label: "Copy UUID",
    valueKey: "currentValue",
    resultValueKey: "uuid"
  }
}
```

Field button options:

- `mode`: Either `run` or `clipboard`. Defaults to `run`.
- `pluginId` or `provider`: Plugin id to call.
- `route`: Direct plugin route to call.
- `action`: Action id to resolve from the provider manifest. If `route` is omitted in `run` mode, this is required.
- `method`: HTTP method for direct routes. Defaults to `POST`.
- `label`: Button label.
- `description`: Text shown above the button.
- `confirm`: Confirmation prompt before running.
- `payload`: Static JSON payload sent with the request.
- `valueKey`: Include the current field value in the request payload under this key.
- `contextKey`: Include field context in the request payload under this key.
- `contextValueKey`: Dot-path to read from field context before writing it to `contextKey`. If omitted, the full context object is sent.
- `resultValueKey`: Dot-path to read from the final action result and write back into the field.
- `clipboardText`: Literal string to copy in `clipboard` mode.
- `clipboardValueKey`: Dot-path to read from the current field value in `clipboard` mode. Defaults to the whole field value.
- `clipboardContextValueKey`: Dot-path to read from field context in `clipboard` mode.
- `clipboardSuccess`: Success notice shown after copying.
- `placement`: Manifest action placement to match. Defaults to `field`.
- `manifestRoute`: Provider manifest route. Defaults to `.well-known/actions`.
- `allowedTargetPluginIds`: Cross-plugin targets allowed when resolving manifest actions.
- `pollIntervalMs` and `pollTimeoutMs`: Async job polling controls.

Clipboard mode uses the browser `navigator.clipboard.writeText()` API. It requires a secure browser context, usually HTTPS or localhost, and browser permission. It does not call the backend.

### Entry Context

The current EmDash admin renders plugin field widgets with `value`, `onChange`, `label`, `id`, `required`, `options`, and `minimal`. The content editor already has richer context nearby, including collection, entry item, locale/i18n, current user, and full form data, but it does not pass that context into plugin field widgets yet.

`emdash-actions` is ready for this host shape:

```ts
type ActionButtonContext = {
  surface: "field" | "dashboard";
  collection?: string;
  collectionLabel?: string;
  fieldName?: string;
  fieldKind?: string;
  fieldLabel?: string;
  fieldRequired?: boolean;
  entryId?: string;
  entrySlug?: string;
  entryStatus?: string;
  entryLocale?: string | null;
  isNew?: boolean;
  fieldValue?: unknown;
  entryData?: Record<string, unknown>;
  currentUser?: { id: string; role?: number };
  i18n?: { defaultLocale?: string; locales?: string[] };
  translations?: unknown[];
  formData?: Record<string, unknown>;
};
```

Without a host-provided context prop, the field button can still infer:

- `collection`, `entryId`, `isNew`, and URL `locale` from `/_emdash/admin/content/:collection/:id` and `/_emdash/admin/content/:collection/new`.
- `fieldName` from the host-provided field element id, which currently follows `field-${name}`.
- `fieldLabel`, `fieldRequired`, and `fieldValue` from the field widget props.
- `entrySlug`, `entryStatus`, `entryLocale`, and `entryData` by fetching the saved entry from `/_emdash/api/content/:collection/:id`.
- `currentUser` by fetching `/_emdash/api/auth/me`.

It cannot infer live unsaved values from sibling fields. For those cases, pass the current field value with `valueKey`, put static data in `payload`, or design the provider route to read the latest saved entry server-side.

## Provider Actions

Provider plugins can describe actions with a manifest. The dashboard widget uses the manifest to render buttons, and a field button can resolve a single manifest action by id. Use `placement: "dashboard"` for dashboard-only actions, `placement: "field"` for field actions, or `placement: "global"` for both.

By default, `emdash-actions` loads a provider manifest from:

```txt
GET /_emdash/api/plugins/site-tools/.well-known/actions
```

A minimal manifest looks like this. This JSON is returned by a provider plugin route, usually `/_emdash/api/plugins/<provider>/.well-known/actions`; it is not added to the site `astro.config.mjs`:

```ts
// In the provider plugin route handler for ".well-known/actions":
export const manifest = {
  actions: [
    {
      id: "cache.clear",
      label: "Clear cache",
      route: "clear-cache",
    },
  ],
};
```

With that manifest, a matching surface shows a `Clear cache` button. Clicking it calls:

```txt
POST /_emdash/api/plugins/site-tools/clear-cache
```

Provider plugins may return plain JSON, or they may use the optional helpers and types from this package in the provider plugin source:

```ts
// src/index.ts in a provider plugin package
import { defineActionsManifest, type ActionsManifest } from "@bnomei/emdash-actions";

export const manifest: ActionsManifest = defineActionsManifest({
  actions: [
    {
      id: "cache.clear",
      label: "Clear cache",
      route: "clear-cache",
      method: "POST",
      tone: "info",
      icon: "bolt",
      confirm: "Clear the site cache?",
    },
  ],
});
```

Using these helpers is optional. A provider can stay completely independent from `emdash-actions` as long as it returns the documented manifest shape.

## Action Options

Each action in the manifest describes one button:

```ts
type ActionDescriptor = {
  id: string;
  label: string;
  route: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  pluginId?: string;
  description?: string;
  icon?: string;
  tone?: "default" | "positive" | "warning" | "danger" | "info";
  confirm?: string;
  placement?: string;
  resultMode?: "emdash-action-result-v1" | "emdash-action-accepted-v1" | string;
  payload?: Record<string, unknown>;
  contextKey?: string;
  contextValueKey?: string;
  disabled?: boolean;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
};
```

Required fields:

- `id`: Stable action id, unique inside the provider manifest.
- `label`: Button label.
- `route`: Relative plugin API route to call when the button is clicked.

Optional fields:

- `method`: HTTP method. Defaults to `POST`.
- `pluginId`: Target plugin id. Defaults to the provider plugin. Cross-plugin targets must be explicitly allowed.
- `description`: Short text shown under the button label.
- `icon`: Icon hint. Current built-ins include `copy`, `clipboard`, `power`, `warning`, `check`, `x`, `close`, `bolt`, and `lightning`.
- `tone`: Visual intent for the button and notices.
- `confirm`: Confirmation prompt shown before the action runs.
- `placement`: Only show this action for a matching widget placement. Use `global` to show it everywhere.
- `resultMode`: Result contract hint. Use `emdash-action-result-v1` for immediate results or `emdash-action-accepted-v1` for accepted async work.
- `payload`: JSON payload sent with the request body for methods that support a body.
- `contextKey`: Include widget context in the request payload under this key.
- `contextValueKey`: Dot-path to read from widget context before writing it to `contextKey`. If omitted, the full context object is sent.
- `disabled`: Render the action as unavailable.
- `pollIntervalMs`: Default polling interval for async job status routes. Defaults to `1500`.
- `pollTimeoutMs`: Maximum time to wait for an async job before showing a timeout. Defaults to `120000`.

Routes are validated before use. They must be relative plugin routes such as `clear-cache` or `.well-known/actions`. Absolute URLs, query strings, hashes, encoded paths, traversal segments, and backslashes are rejected.

## Dashboard Widget

Use the dashboard widget when an action is global to the site or provider rather than contextual to one field.

Dashboard actions use the same manifest contract as field actions. A dashboard action can opt into context with `contextKey` and `contextValueKey`. Without host support, dashboard context is intentionally small: `surface: "dashboard"` plus `currentUser` when the auth endpoint responds. It does not contain entry data, because the dashboard is not tied to one content item.

Screenshot pending. Capture this from a real EmDash dashboard after wiring the widget into a host project:

```txt
docs/actions-dashboard.png
```

Dashboard widget options go into the `actionsPlugin()` call in `astro.config.mjs`:

```ts
// astro.config.mjs
actionsPlugin({
  title: "Actions",
  size: "half",
  placement: "dashboard",
  providers: [
    {
      pluginId: "site-tools",
      label: "Site tools",
      manifestRoute: ".well-known/actions",
      allowedTargetPluginIds: [],
    },
  ],
});
```

Available options:

- `title`: Dashboard widget title. Defaults to `Actions`.
- `size`: Widget size, either `full`, `half`, or `third`. Defaults to `half`.
- `placement`: Which action placement this widget should show. Defaults to `dashboard`. Set to `null` to show all actions.
- `providers`: Action provider plugins to load.
- `entrypoint`: Package entrypoint for the native descriptor. Defaults to `@bnomei/emdash-actions`.
- `adminEntry`: Admin UI entrypoint. Defaults to `@bnomei/emdash-actions/admin`.

Provider options:

- `pluginId`: Provider plugin id.
- `label`: Human-readable provider label.
- `manifestRoute`: Provider route that returns the actions manifest. Defaults to `.well-known/actions`.
- `allowedTargetPluginIds`: Plugin ids this provider may target with action descriptors.

## Example Provider

The first example provider is `@bnomei/emdash-action-maintenance`. It exposes maintenance mode actions that the dashboard can render as buttons.

Install both packages:

```sh
vp install @bnomei/emdash-actions @bnomei/emdash-action-maintenance
```

Register the actions UI and the maintenance provider in the `emdash({ plugins: [...] })` list in `astro.config.mjs`:

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { actionsPlugin } from "@bnomei/emdash-actions";
import {
  PLUGIN_ID as MAINTENANCE_PLUGIN_ID,
  actionMaintenance,
} from "@bnomei/emdash-action-maintenance";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [
        actionsPlugin({
          providers: [
            {
              pluginId: MAINTENANCE_PLUGIN_ID,
              label: "Maintenance",
            },
          ],
        }),
        actionMaintenance({
          defaultMessage: "This site is temporarily unavailable. Please check back soon.",
        }),
      ],
    }),
  ],
});
```

The maintenance provider can expose buttons for toggling, enabling, and disabling maintenance mode. The provider owns those API routes; `emdash-actions` only renders the buttons and calls the configured endpoints.

## Async Jobs

For Cloudflare/serverless actions that start longer work, return an accepted result with a `statusRoute`. The button surface keeps the action loading, polls that route, and updates the notice until the job reaches a terminal state.

Initial action response from the provider route that starts the job:

```ts
// Response body from POST /_emdash/api/plugins/<provider>/<route>
{
  ok: true,
  status: 202,
  jobId: "backup-01",
  jobStatus: "accepted",
  statusRoute: "jobs/backup-01",
  message: "Backup accepted.",
  pollAfterMs: 1500,
}
```

Status route response while the job is still active:

```ts
// Response body from GET /_emdash/api/plugins/<provider>/jobs/backup-01
{
  ok: true,
  status: 200,
  jobId: "backup-01",
  jobStatus: "running",
  statusRoute: "jobs/backup-01",
  progress: 0.42,
  message: "Writing archive.",
}
```

Terminal status route response:

```ts
// Response body from GET /_emdash/api/plugins/<provider>/jobs/backup-01
{
  ok: true,
  status: 200,
  jobId: "backup-01",
  jobStatus: "succeeded",
  progress: 1,
  message: "Backup complete.",
}
```

Supported job statuses:

- `accepted`, `queued`, `running`: The widget keeps polling.
- `succeeded`: The widget stops polling and shows a success notice.
- `failed`, `cancelled`: The widget stops polling and shows an error notice.

`statusRoute` must be a relative plugin route under the action's target plugin. The same route validation rules apply as for action routes.

If a provider returns `status: 202` or `resultMode: "emdash-action-accepted-v1"` without a `statusRoute`, the widget can only show the accepted result. It cannot infer queued, running, failed, or completed state without a provider-owned status endpoint.

## Development

```sh
vp install
vp run typecheck
vp run build
vp run pack:check
```
