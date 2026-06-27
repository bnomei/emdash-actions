/**
 * Immutable busy-key tracking for concurrent action runs in the dashboard widget.
 *
 * Keys are scoped as `providerPluginId:actionId` so independent actions can run
 * in parallel without sharing disabled state.
 */
export type BusyKeySet = ReadonlySet<string>;

export function actionBusyKey(providerPluginId: string, actionId: string) {
  return `${providerPluginId}:${actionId}`;
}

export function isActionBusy(busyKeys: BusyKeySet, key: string) {
  return busyKeys.has(key);
}

export function isActionDisabled(busyKeys: BusyKeySet, key: string, disabled = false) {
  return disabled || isActionBusy(busyKeys, key);
}

export function addBusyKey(busyKeys: BusyKeySet, key: string) {
  if (busyKeys.has(key)) return busyKeys;
  const next = new Set(busyKeys);
  next.add(key);
  return next;
}

export function removeBusyKey(busyKeys: BusyKeySet, key: string) {
  if (!busyKeys.has(key)) return busyKeys;
  const next = new Set(busyKeys);
  next.delete(key);
  return next;
}
