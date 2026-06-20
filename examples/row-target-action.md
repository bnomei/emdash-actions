# Row Target Action

Row targets are for future or host-provided nested row surfaces. A row target
identifies the current nested location with `path` and may include a `rowId`
from stored row data when available.

```ts
export const manifest = {
  actions: [
    {
      id: "row.translate",
      runner: true,
      label: "Translate row",
      placement: "field",
      target: {
        surfaces: ["row"],
        required: true,
        idFrom: "rowId",
      },
      payload: { locale: "de" },
    },
  ],
} satisfies import("@bnomei/emdash-actions").ActionsManifest;
```

A host-provided row context can produce this invocation target:

```json
{
  "type": "row",
  "surface": "row",
  "collection": "pages",
  "entryId": "home",
  "fieldName": "blocks",
  "rowId": "block-1",
  "path": "blocks.0",
  "value": {
    "id": "block-1",
    "text": "Hello"
  }
}
```

`rowId` should come from stored row data such as `row.id` or `value.id`.
`path` is only the current nested location and is not an authorization boundary.
Provider runners must re-read the authoritative entry and row before mutating.
