import assert from "node:assert/strict";
import test from "node:test";
import {
  addBusyKey,
  isActionBusy,
  isActionDisabled,
  removeBusyKey,
} from "../test-dist/busy-state.js";

test("independent actions can be busy concurrently without disabling each other", () => {
  let busyKeys = new Set();
  busyKeys = addBusyKey(busyKeys, "provider-a:sync");
  busyKeys = addBusyKey(busyKeys, "provider-b:publish");

  assert.equal(isActionBusy(busyKeys, "provider-a:sync"), true);
  assert.equal(isActionBusy(busyKeys, "provider-b:publish"), true);
  assert.equal(isActionDisabled(busyKeys, "provider-c:reindex"), false);
});

test("same action remains disabled only while its scoped busy key is active", () => {
  let busyKeys = addBusyKey(new Set(), "provider-a:sync");

  assert.equal(isActionDisabled(busyKeys, "provider-a:sync"), true);
  assert.equal(isActionDisabled(busyKeys, "provider-a:sync", true), true);

  busyKeys = removeBusyKey(busyKeys, "provider-a:sync");

  assert.equal(isActionDisabled(busyKeys, "provider-a:sync"), false);
});
