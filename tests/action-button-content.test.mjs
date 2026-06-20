import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionButtonContent } from "../dist/admin.mjs";

test("action button content renders visible labels next to icons", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ActionButtonContent, {
      icon: React.createElement("span", { "aria-hidden": "true" }, "i"),
      label: "Replay webhook with a deliberately long label",
    }),
  );

  assert.match(markup, /Replay webhook with a deliberately long label/);
  assert.match(markup, /overflow-wrap:anywhere/);
  assert.doesNotMatch(markup, /white-space:nowrap/);
});
