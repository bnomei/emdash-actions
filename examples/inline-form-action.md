# Inline Form Action

Use `form.mode: "inline"` when a runner action needs a few scalar inputs before
submit. The form is intentionally small: string, number, integer, boolean,
datetime, and select fields.

```ts
export const manifest = {
  actions: [
    {
      id: "entry.generateSummary",
      runner: true,
      label: "Generate summary",
      placement: "field",
      payload: {
        format: "short",
        count: 3,
      },
      target: {
        surfaces: ["field"],
        required: true,
        idFrom: "entryId",
      },
      form: {
        mode: "inline",
        submitLabel: "Generate",
        fields: [
          { name: "format", type: "select", options: ["short", "long"], required: true },
          { name: "count", type: "integer", default: 3 },
          { name: "includeDrafts", type: "boolean", default: false },
        ],
      },
    },
  ],
} satisfies import("@bnomei/emdash-actions").ActionsManifest;
```

Submitted form values are merged into `payload` after manifest and field-option
payload defaults, so user input wins:

```json
{
  "invocationId": "inv_...",
  "actionId": "entry.generateSummary",
  "payload": {
    "format": "long",
    "count": 5,
    "includeDrafts": true
  },
  "target": {
    "type": "field",
    "surface": "field",
    "collection": "posts",
    "entryId": "post-1",
    "fieldName": "summary"
  }
}
```

Required fields and missing `target.idFrom` values block the request in the
admin UI. Providers still need to validate and authorize the invocation
server-side.
