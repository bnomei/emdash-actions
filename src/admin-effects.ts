import { apiFetch } from "emdash/plugin-utils";
import { localizedString } from "./i18n";
import { providerPluginRoute, normalizePluginRoute } from "./shared";
import {
  asRecord,
  cleanOptionalString,
  numberOrNull,
  readNullablePayload,
  readNullableLocalizedString,
  readNullableString,
  readNullableTone,
  readOpenTarget,
  readOptionalBoolean,
  readOptionalNumber,
  readRequiredLocalizedString,
} from "./admin-manifest";
import type {
  ActionManifestDescriptor,
  ActionResultActionPatch,
  ActionResultEffectPreset,
  ActionResultEffects,
  ActionResultOpenTarget,
  ActionRunResult,
  ActionReloadScope,
} from "./types";

export type ActionEffectTarget = ActionManifestDescriptor & {
  targetPluginId: string;
};

type DownloadEffect = {
  filename?: string;
  route?: string;
  url?: string;
};

export type ReloadEffect = {
  scope?: ActionReloadScope;
  delayMs?: number;
};

type ActionEffectName = "clipboard" | "download" | "open" | "reload";

type ActionEffectDependencies = {
  writeClipboardText?: (text: string) => Promise<void>;
  runDownloadEffect?: (action: ActionEffectTarget, effect: DownloadEffect) => Promise<void>;
  runOpenEffect?: (effect: { url: string; target: ActionResultOpenTarget }) => void;
  scheduleReload?: (
    action: ActionManifestDescriptor,
    effect: ReloadEffect,
    signal?: AbortSignal,
  ) => void;
  onEffectError?: (name: ActionEffectName, error: unknown) => void;
  // Lifetime signal of the initiating widget; aborts a deferred reload timer
  // when the widget unmounts so it cannot reload a route the user has left.
  reloadSignal?: AbortSignal;
};

export function normalizeActionRunResult(
  action: Pick<ActionManifestDescriptor, "resultEffect">,
  value: unknown,
): ActionRunResult {
  const record = asRecord(value);
  if (record) return normalizeResultRecord(record);

  if (typeof value === "string") {
    const effects = effectsFromResultEffect(action.resultEffect, value);
    if (effects) {
      return {
        ok: true,
        status: 200,
        effects,
      };
    }

    return {
      ok: true,
      status: 200,
      message: value,
    };
  }

  if (value === undefined || value === null) {
    return {
      ok: true,
      status: 200,
    };
  }

  return {
    ok: true,
    status: 200,
    value,
  };
}

// The object branch is provider-controlled, but the polling classifiers assume
// a numeric `status` (compared against 202 / >= 400) and a boolean `ok`. Coerce
// those fields so a wrong-typed value cannot bypass the `typeof === "number"`
// error guard and misclassify a failure as a successful terminal result.
function normalizeResultRecord(record: Record<string, unknown>): ActionRunResult {
  const result = { ...record } as ActionRunResult;

  if ("status" in record) {
    const status = coerceFiniteNumber(record.status);
    if (status === null) delete result.status;
    else result.status = status;
  }

  // Fail safe: a present but non-boolean `ok` becomes false (an error) rather
  // than slipping past the `ok === false` check as a non-error.
  if ("ok" in record && typeof record.ok !== "boolean") {
    result.ok = record.ok === "true" || record.ok === 1;
  }

  return result;
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function effectsFromResultEffect(
  preset: ActionResultEffectPreset | undefined,
  value: string,
): ActionResultEffects | null {
  if (!preset) return null;

  if (typeof preset === "string") {
    if (preset === "clipboard" || preset === "copy") return { clipboard: { text: value } };
    if (preset === "open") return { open: { url: value, target: "blank" } };
    if (preset === "download") return { download: { url: value } };
    return null;
  }

  if (preset.type === "clipboard" || preset.type === "copy") {
    return { clipboard: { text: value } };
  }

  if (preset.type === "open") {
    return { open: { url: value, target: preset.target ?? "blank" } };
  }

  if (preset.type === "download") {
    return { download: { url: value, filename: preset.filename } };
  }

  return null;
}

// Sentinel returned by `readPatchField` when a patch reader throws, so an
// invalid field is dropped without being confused for a legitimate `null`.
const PATCH_FIELD_DROP = Symbol("patch-field-drop");

// A successful terminal result must still run effects and (in field mode) the
// result writeback even when the server attaches a malformed `action` patch.
// Validate each optional patch field tolerantly: keep what parses, drop what
// throws, and never abort the post-success sequence over a cosmetic field.
function readPatchField<T>(read: () => T): T | typeof PATCH_FIELD_DROP {
  try {
    return read();
  } catch {
    return PATCH_FIELD_DROP;
  }
}

export function actionPatchFromResult(result: ActionRunResult): ActionResultActionPatch | null {
  const patch = asRecord(result.action);
  if (!patch) return null;

  const next: ActionResultActionPatch = {};
  if (Object.hasOwn(patch, "label")) {
    const label = readPatchField(() => readRequiredLocalizedString(patch.label, "action.label"));
    if (label !== PATCH_FIELD_DROP) next.label = label;
  }
  if (Object.hasOwn(patch, "icon")) {
    const icon = readPatchField(() => readNullableString(patch.icon, "action.icon"));
    if (icon !== PATCH_FIELD_DROP) next.icon = icon;
  }
  if (Object.hasOwn(patch, "tone")) {
    const tone = readPatchField(() => readNullableTone(patch.tone, "action.tone"));
    if (tone !== PATCH_FIELD_DROP) next.tone = tone;
  }
  if (Object.hasOwn(patch, "description")) {
    const description = readPatchField(() =>
      readNullableLocalizedString(patch.description, "action.description"),
    );
    if (description !== PATCH_FIELD_DROP) next.description = description;
  }
  if (Object.hasOwn(patch, "disabled")) {
    const disabled = readPatchField(
      () => readOptionalBoolean(patch.disabled, "action.disabled") ?? false,
    );
    if (disabled !== PATCH_FIELD_DROP) next.disabled = disabled;
  }
  if (Object.hasOwn(patch, "confirm")) {
    const confirm = readPatchField(() =>
      readNullableLocalizedString(patch.confirm, "action.confirm"),
    );
    if (confirm !== PATCH_FIELD_DROP) next.confirm = confirm;
  }
  if (Object.hasOwn(patch, "payload")) {
    const payload = readPatchField(() => readNullablePayload(patch.payload));
    if (payload !== PATCH_FIELD_DROP) next.payload = payload;
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function mergeActionResultPatch<TAction extends ActionManifestDescriptor>(
  action: TAction,
  result: ActionRunResult,
): TAction | null {
  const patch = actionPatchFromResult(result);
  return patch ? mergeActionPatch(action, patch) : null;
}

export function mergeActionPatch<TAction extends ActionManifestDescriptor>(
  action: TAction,
  patch: ActionResultActionPatch,
): TAction {
  const next = { ...action };

  if (patch.label !== undefined) next.label = patch.label;
  if (Object.hasOwn(patch, "icon")) {
    if (patch.icon === null) delete next.icon;
    else next.icon = patch.icon;
  }
  if (Object.hasOwn(patch, "tone")) {
    if (patch.tone === null) delete next.tone;
    else next.tone = patch.tone;
  }
  if (Object.hasOwn(patch, "description")) {
    if (patch.description === null) delete next.description;
    else next.description = patch.description;
  }
  if (patch.disabled !== undefined) next.disabled = patch.disabled;
  if (Object.hasOwn(patch, "confirm")) {
    if (patch.confirm === null) delete next.confirm;
    else next.confirm = patch.confirm;
  }
  if (Object.hasOwn(patch, "payload")) {
    if (patch.payload === null) delete next.payload;
    else next.payload = patch.payload;
  }

  return next;
}

export function actionPatchChangesLabel(result: ActionRunResult) {
  return asRecord(result.action)?.label !== undefined;
}

export function actionPatchChangesPayload(result: ActionRunResult) {
  const patch = asRecord(result.action);
  return patch !== null && Object.hasOwn(patch, "payload");
}

export async function runActionEffects(
  action: ActionEffectTarget,
  result: ActionRunResult,
  dependencies: ActionEffectDependencies = {},
) {
  const effects = actionResultEffects(result);
  if (!effects) return;

  const writeClipboard = dependencies.writeClipboardText ?? writeClipboardText;
  const runDownload = dependencies.runDownloadEffect ?? runDownloadEffect;
  const runOpen = dependencies.runOpenEffect ?? runOpenEffect;
  const reload = dependencies.scheduleReload ?? scheduleReload;
  const onEffectError = dependencies.onEffectError ?? noopEffectError;

  // Effects are independent, best-effort side effects. Isolate each (parse +
  // execution) so a failing one — e.g. clipboard denied on plain HTTP, or a
  // malformed download shape — neither skips the remaining effects (a
  // requested reload still runs) nor reclassifies a server-successful action
  // as a failure in the run caller's catch.
  async function runEffect(name: ActionEffectName, run: () => void | Promise<void>) {
    try {
      await run();
    } catch (error) {
      onEffectError(name, error);
    }
  }

  await runEffect("clipboard", async () => {
    const clipboard = clipboardEffectText(effects.clipboard);
    if (clipboard !== null) await writeClipboard(clipboard);
  });
  await runEffect("download", async () => {
    const download = asDownloadEffect(effects.download);
    if (download) await runDownload(action, download);
  });
  await runEffect("open", () => {
    const open = asOpenEffect(effects.open);
    if (open) runOpen(open);
  });
  await runEffect("reload", () => {
    const reloadEffect = asReloadEffect(effects.reload);
    if (reloadEffect) reload(action, reloadEffect, dependencies.reloadSignal);
  });
}

const noopEffectError: (name: ActionEffectName, error: unknown) => void = () => {};

export function actionResultEffects(result: ActionRunResult): ActionResultEffects | null {
  const effects = asRecord(result.effects) ? ({ ...result.effects } as ActionResultEffects) : {};
  if (result.reload !== undefined) effects.reload = result.reload;
  if (result.open !== undefined) effects.open = result.open;
  if (result.download !== undefined) effects.download = result.download;
  if (result.clipboard !== undefined) effects.clipboard = result.clipboard;
  return Object.keys(effects).length > 0 ? effects : null;
}

export function clipboardEffectText(value: ActionResultEffects["clipboard"] | undefined) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  const text = asRecord(value)?.text;
  if (typeof text !== "string") throw new Error("Clipboard effect requires text.");
  return text;
}

export function asOpenEffect(value: ActionResultEffects["open"] | undefined) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    return {
      target: "blank" as ActionResultOpenTarget,
      url: value,
    };
  }

  const record = asRecord(value);
  const url = cleanOptionalString(record?.url);
  if (!url) throw new Error("Open effect requires a URL.");

  return {
    target: readOpenTarget(record?.target) ?? "blank",
    url,
  };
}

export function asDownloadEffect(value: ActionResultEffects["download"] | undefined) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return { url: value };

  const record = asRecord(value);
  if (!record) throw new Error("Download effect must be a string or object.");

  const url = cleanOptionalString(record.url);
  const route = cleanOptionalString(record.route);
  if (!url && !route) throw new Error("Download effect requires a URL or route.");

  return {
    filename: cleanOptionalString(record.filename),
    route,
    url,
  };
}

export function asReloadEffect(value: ActionResultEffects["reload"] | undefined) {
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return {};

  const record = asRecord(value);
  if (!record) throw new Error("Reload effect must be true or an object.");
  const scope = readReloadScope(record.scope);
  return {
    ...(scope ? { scope } : {}),
    delayMs: readOptionalNumber(record.delayMs, "effects.reload.delayMs"),
  };
}

function readReloadScope(value: unknown): ActionReloadScope | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Reload scope must be a string");
  if (value === "field" || value === "entry" || value === "dashboard" || value === "page") {
    return value;
  }
  throw new Error(`Unsupported reload scope: ${value}`);
}

export function runOpenEffect(effect: { url: string; target: ActionResultOpenTarget }) {
  if (effect.target === "self") {
    // Same-tab navigation replaces the authenticated admin in place, so a
    // server-controlled `open` effect must not redirect it off-origin (e.g. a
    // protocol-relative `//evil.example` value). New-tab opens stay permissive
    // (external links are a feature) but use noopener,noreferrer.
    const url = safeBrowserUrl(effect.url, { sameOrigin: true });
    globalThis.location.assign(url.href);
    return;
  }
  const url = safeBrowserUrl(effect.url);
  globalThis.open(url.href, "_blank", "noopener,noreferrer");
}

export async function runDownloadEffect(action: ActionEffectTarget, effect: DownloadEffect) {
  if (effect.route) {
    const response = await apiFetch(
      providerPluginRoute(action.targetPluginId, normalizePluginRoute(effect.route)),
    );
    if (!response.ok) {
      throw new Error(
        `Failed to download ${effect.filename ?? localizedString(action.label, undefined, action.id)}`,
      );
    }
    const blobUrl = globalThis.URL.createObjectURL(await response.blob());
    try {
      triggerDownload(blobUrl, effect.filename);
    } finally {
      globalThis.setTimeout(() => globalThis.URL.revokeObjectURL(blobUrl), 0);
    }
    return;
  }

  if (!effect.url) throw new Error("Download effect requires a URL or route.");
  triggerDownload(safeBrowserUrl(effect.url).href, effect.filename);
}

export function triggerDownload(url: string, filename: string | undefined) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? "";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function scheduleReload(
  action: Pick<ActionManifestDescriptor, "cooldownMs">,
  effect: ReloadEffect | number | undefined,
  signal?: AbortSignal,
) {
  // Cancel if the initiating surface has already unmounted, so a deferred
  // reload does not fire on a route the user has navigated to since.
  if (signal?.aborted) return;
  const reloadEffect = typeof effect === "number" ? { delayMs: effect } : (effect ?? {});
  const delayMs = reloadEffect.delayMs;
  const delay = clampFeedbackMs(delayMs ?? feedbackCooldownMs(action));
  const timer = globalThis.setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    const scope = reloadEffect.scope ?? "page";
    const shouldContinue = dispatchReloadEvent(action, { ...reloadEffect, scope });
    if (shouldContinue) globalThis.location?.reload();
  }, delay);

  function onAbort() {
    globalThis.clearTimeout(timer);
  }
  signal?.addEventListener("abort", onAbort, { once: true });
}

function dispatchReloadEvent(
  action: Pick<ActionManifestDescriptor, "cooldownMs">,
  effect: ReloadEffect & { scope: ActionReloadScope },
) {
  if (typeof globalThis.dispatchEvent !== "function" || typeof CustomEvent === "undefined") {
    return true;
  }
  return globalThis.dispatchEvent(
    new CustomEvent("emdash-actions:reload", {
      cancelable: true,
      detail: {
        action,
        scope: effect.scope,
      },
    }),
  );
}

export function safeBrowserUrl(value: string, options: { sameOrigin?: boolean } = {}) {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.href;
  const url = new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Action URL must use http, https, or be relative.");
  }
  // A protocol-relative or absolute cross-origin URL passes the protocol check
  // but resolves to a foreign origin. Callers that drive same-tab navigation
  // must opt into a strict same-origin check to avoid a forced off-origin
  // redirect of the authenticated admin.
  if (options.sameOrigin && url.origin !== new URL(base).origin) {
    throw new Error("Action URL must stay on the current origin.");
  }
  return url;
}

export async function writeClipboardText(text: string) {
  if (!globalThis.isSecureContext || !globalThis.navigator?.clipboard?.writeText) {
    throw new Error("Clipboard access requires HTTPS or localhost, plus browser permission.");
  }
  await globalThis.navigator.clipboard.writeText(text);
}

export function feedbackCooldownMs(
  source: Pick<ActionManifestDescriptor, "cooldownMs"> | undefined,
) {
  return clampFeedbackMs(numberOrNull(source?.cooldownMs) ?? 2000);
}

export function clampFeedbackMs(value: number) {
  return Math.min(60000, Math.max(0, value));
}
