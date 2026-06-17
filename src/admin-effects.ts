import { apiFetch } from "emdash/plugin-utils";
import { providerPluginRoute, normalizePluginRoute } from "./shared";
import {
  asRecord,
  cleanOptionalString,
  numberOrNull,
  readNullablePayload,
  readNullableString,
  readNullableTone,
  readOpenTarget,
  readOptionalBoolean,
  readOptionalNumber,
  readRequiredString,
} from "./admin-manifest";
import type {
  ActionDescriptor,
  ActionResultActionPatch,
  ActionResultEffectPreset,
  ActionResultEffects,
  ActionResultOpenTarget,
  ActionRunResult,
} from "./types";

export type ActionEffectTarget = ActionDescriptor & {
  targetPluginId: string;
};

type DownloadEffect = {
  filename?: string;
  route?: string;
  url?: string;
};

type ActionEffectDependencies = {
  writeClipboardText?: (text: string) => Promise<void>;
  runDownloadEffect?: (action: ActionEffectTarget, effect: DownloadEffect) => Promise<void>;
  runOpenEffect?: (effect: { url: string; target: ActionResultOpenTarget }) => void;
  scheduleReload?: (action: ActionDescriptor, delayMs: number | undefined) => void;
};

export function normalizeActionRunResult(
  action: Pick<ActionDescriptor, "resultEffect">,
  value: unknown,
): ActionRunResult {
  const record = asRecord(value);
  if (record) return record as ActionRunResult;

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

export function actionPatchFromResult(result: ActionRunResult): ActionResultActionPatch | null {
  const patch = asRecord(result.action);
  if (!patch) return null;

  const next: ActionResultActionPatch = {};
  if (Object.hasOwn(patch, "label")) next.label = readRequiredString(patch.label, "action.label");
  if (Object.hasOwn(patch, "icon")) next.icon = readNullableString(patch.icon, "action.icon");
  if (Object.hasOwn(patch, "tone")) next.tone = readNullableTone(patch.tone, "action.tone");
  if (Object.hasOwn(patch, "description")) {
    next.description = readNullableString(patch.description, "action.description");
  }
  if (Object.hasOwn(patch, "disabled")) {
    next.disabled = readOptionalBoolean(patch.disabled, "action.disabled") ?? false;
  }
  if (Object.hasOwn(patch, "confirm")) {
    next.confirm = readNullableString(patch.confirm, "action.confirm");
  }
  if (Object.hasOwn(patch, "payload")) next.payload = readNullablePayload(patch.payload);

  return Object.keys(next).length > 0 ? next : null;
}

export function mergeActionResultPatch<TAction extends ActionDescriptor>(
  action: TAction,
  result: ActionRunResult,
): TAction | null {
  const patch = actionPatchFromResult(result);
  return patch ? mergeActionPatch(action, patch) : null;
}

export function mergeActionPatch<TAction extends ActionDescriptor>(
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

  const clipboard = clipboardEffectText(effects.clipboard);
  if (clipboard !== null) await writeClipboard(clipboard);

  const download = asDownloadEffect(effects.download);
  if (download) await runDownload(action, download);

  const open = asOpenEffect(effects.open);
  if (open) runOpen(open);

  const reloadEffect = asReloadEffect(effects.reload);
  if (reloadEffect) reload(action, reloadEffect.delayMs);
}

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
  return {
    delayMs: readOptionalNumber(record.delayMs, "effects.reload.delayMs"),
  };
}

export function runOpenEffect(effect: { url: string; target: ActionResultOpenTarget }) {
  const url = safeBrowserUrl(effect.url);
  if (effect.target === "self") {
    globalThis.location.assign(url.href);
    return;
  }
  globalThis.open(url.href, "_blank", "noopener,noreferrer");
}

export async function runDownloadEffect(action: ActionEffectTarget, effect: DownloadEffect) {
  if (effect.route) {
    const response = await apiFetch(
      providerPluginRoute(action.targetPluginId, normalizePluginRoute(effect.route)),
    );
    if (!response.ok) {
      throw new Error(`Failed to download ${effect.filename ?? action.label}`);
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
  action: Pick<ActionDescriptor, "cooldownMs">,
  delayMs: number | undefined,
) {
  const delay = clampFeedbackMs(delayMs ?? feedbackCooldownMs(action));
  globalThis.setTimeout(() => {
    globalThis.location.reload();
  }, delay);
}

export function safeBrowserUrl(value: string) {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.href;
  const url = new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Action URL must use http, https, or be relative.");
  }
  return url;
}

export async function writeClipboardText(text: string) {
  if (!globalThis.isSecureContext || !globalThis.navigator?.clipboard?.writeText) {
    throw new Error("Clipboard access requires HTTPS or localhost, plus browser permission.");
  }
  await globalThis.navigator.clipboard.writeText(text);
}

export function feedbackCooldownMs(source: Pick<ActionDescriptor, "cooldownMs"> | undefined) {
  return clampFeedbackMs(numberOrNull(source?.cooldownMs) ?? 2000);
}

export function clampFeedbackMs(value: number) {
  return Math.min(60000, Math.max(0, value));
}
