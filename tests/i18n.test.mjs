import assert from "node:assert/strict";
import { test } from "node:test";

import {
  actionMessage,
  formatActionMessage,
  localeFallbacks,
  localizedString,
} from "../dist/index.mjs";

test("action messages follow the EmDash-style fallback chain", () => {
  const i18n = {
    locale: "fr-CA",
    defaultLocale: "en",
    locales: ["en", "fr", "fr-CA"],
    fallback: { "fr-CA": "fr", fr: "en" },
    messages: {
      fr: { runAction: "Executer" },
      en: { actionRunning: "{action} is still running." },
    },
  };

  assert.deepEqual(localeFallbacks(i18n), ["fr-CA", "fr", "en"]);
  assert.equal(actionMessage("runAction", i18n), "Executer");
  assert.equal(
    formatActionMessage("actionRunning", i18n, { action: "Import" }),
    "Import is still running.",
  );
  assert.equal(localizedString({ en: "Publish", fr: "Publier" }, i18n), "Publier");
});

test("action messages keep an English source override as final fallback", () => {
  const i18n = {
    locale: "it",
    defaultLocale: "fr",
    locales: ["fr", "it"],
    messages: {
      en: { copy: "Copy value" },
    },
  };

  assert.deepEqual(localeFallbacks(i18n), ["it", "fr"]);
  assert.equal(actionMessage("copy", i18n), "Copy value");
  assert.equal(localizedString({ en: "Copy", fr: "" }, i18n), "Copy");
});
