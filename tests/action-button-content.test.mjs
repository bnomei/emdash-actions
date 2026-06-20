import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fields } from "../dist/admin.mjs";

test("field action button renders visible long labels next to icons", () => {
  const label = "Replay webhook with a deliberately long label";
  const markup = renderToStaticMarkup(
    React.createElement(fields.button, {
      minimal: true,
      onChange() {},
      options: {
        icon: "replay",
        label,
      },
      value: "",
    }),
  );

  assert.match(markup, new RegExp(label));
  assert.match(markup, new RegExp(`aria-label="${label}"`));
  assert.match(markup, /<svg[\s>]/);
  assert.match(markup, /max-width:100%/);
  assert.match(markup, /min-width:0/);
  assert.match(markup, /overflow-wrap:anywhere/);
  assert.doesNotMatch(markup, /white-space:nowrap/);
});
