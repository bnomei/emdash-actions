# Clipboard Field Button

Use clipboard mode when the button can copy a value already available in the
browser. It does not call a backend route.

## Files Used

- Target collection schema file, for example `seed/schema.ts`,
  `seed/site.seed.json`, or the project-local script that defines EmDash
  collections. Add the field object to that collection's `fields` array.
- `astro.config.mjs`: must already register `actionsPlugin()` so the
  `actions:button` field widget exists.
- No provider route file is needed for clipboard mode.

## Field JSON

Put each object below inside the target collection schema's `fields` array, for
example in a seed JSON file or a project-local schema setup script.

Copy a configured literal value:

```json
{
  "slug": "support_code",
  "label": "Support Code",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "clipboard",
    "label": "Copy support code",
    "description": "Copies the fixed support code for this project.",
    "clipboardText": "leoconomy-support",
    "clipboardSuccess": "Support code copied."
  }
}
```

Copy the current field value:

```json
{
  "slug": "external_id",
  "label": "External ID",
  "type": "string",
  "widget": "actions:button",
  "options": {
    "mode": "clipboard",
    "label": "Copy external ID",
    "clipboardSuccess": "External ID copied."
  }
}
```

Copy a nested value from a JSON field:

```json
{
  "slug": "integration_profile",
  "label": "Integration Profile",
  "type": "json",
  "widget": "actions:button",
  "options": {
    "mode": "clipboard",
    "label": "Copy remote ID",
    "clipboardValueKey": "remote.id",
    "clipboardSuccess": "Remote ID copied."
  }
}
```

## Backend Code

None. Clipboard mode uses `navigator.clipboard.writeText()` in the admin
browser.

## Frontend Behavior

Clicking the button copies the configured text or selected field value. The
button temporarily changes to the `clipboardSuccess` message. Clipboard access
requires a secure browser context such as HTTPS or localhost.
