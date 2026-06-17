import assert from "node:assert/strict";
import { test } from "node:test";

import { confirmDestructiveAction } from "../dist/admin.mjs";

test("confirmDestructiveAction confirms destructive actions with the provided message", () => {
  const calls = [];

  const confirmed = confirmDestructiveAction("Delete entry?", (message) => {
    calls.push(message);
    return true;
  });

  assert.equal(confirmed, true);
  assert.deepEqual(calls, ["Delete entry?"]);
});

test("confirmDestructiveAction cancels destructive actions when the user declines", () => {
  const cancelled = confirmDestructiveAction("Delete entry?", () => false);

  assert.equal(cancelled, false);
});

test("confirmDestructiveAction lets browser confirm errors surface", () => {
  const error = new Error("confirm unavailable");

  assert.throws(
    () =>
      confirmDestructiveAction("Delete entry?", () => {
        throw error;
      }),
    error,
  );
});
