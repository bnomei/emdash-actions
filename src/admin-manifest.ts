import { DEFAULT_MANIFEST_ROUTE, normalizePluginId, normalizePluginRoute } from "./shared";
import type {
  ActionButtonFieldOptions,
  ActionButtonMode,
  ActionButtonStyle,
  ActionDescriptor,
  ActionFeedbackOptions,
  ActionMethod,
  ActionProviderConfig,
  ActionResultEffectPreset,
  ActionResultOpenTarget,
  ActionsManifest,
  ActionTone,
  NormalizedActionProviderConfig,
} from "./types";

const ACTION_METHODS = new Set<ActionMethod>(["POST", "PUT", "PATCH", "DELETE"]);
const ACTION_BUTTON_MODES = new Set<ActionButtonMode>(["run", "clipboard"]);
const ACTION_TONES = new Set<ActionTone>(["default", "positive", "warning", "danger", "info"]);
const ACTION_RESULT_EFFECT_PRESETS = new Set(["clipboard", "copy", "open", "download"]);
const ACTION_RESULT_OPEN_TARGETS = new Set<ActionResultOpenTarget>(["self", "blank"]);
const MAX_ACTIONS_PER_PROVIDER = 50;
const MAX_STRING_LENGTH = 220;

export function parseActionsManifest(
  value: unknown,
  provider: NormalizedActionProviderConfig,
): ActionsManifest {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.actions)) {
    throw new Error("Action manifest must contain an actions array");
  }
  if (record.actions.length > MAX_ACTIONS_PER_PROVIDER) {
    throw new Error(`Action manifest contains more than ${MAX_ACTIONS_PER_PROVIDER} actions`);
  }

  const seenIds = new Set<string>();
  const actions = record.actions.map((action, index) => {
    const parsed = parseActionDescriptor(action, provider, index);
    if (seenIds.has(parsed.id)) {
      throw new Error(`Duplicate action id: ${parsed.id}`);
    }
    seenIds.add(parsed.id);
    return parsed;
  });

  return { actions };
}

function parseActionDescriptor(
  value: unknown,
  provider: NormalizedActionProviderConfig,
  index: number,
): ActionDescriptor {
  const record = asRecord(value);
  if (!record) throw new Error(`Action at index ${index} must be an object`);

  const pluginId = readOptionalString(record.pluginId, "pluginId");
  const targetPluginId = pluginId ? normalizeTargetPluginId(provider, pluginId) : undefined;
  const payload = readPayload(record.payload);

  return {
    id: readRequiredString(record.id, "id"),
    label: readRequiredString(record.label, "label"),
    route: normalizePluginRoute(readRequiredString(record.route, "route")),
    confirm: readOptionalString(record.confirm, "confirm"),
    contextKey: readOptionalString(record.contextKey, "contextKey"),
    contextValueKey: readOptionalString(record.contextValueKey, "contextValueKey"),
    buttonStyle: readOptionalButtonStyle(record.buttonStyle, "buttonStyle"),
    cooldownMs: readOptionalNumber(record.cooldownMs, "cooldownMs"),
    description: readOptionalString(record.description, "description"),
    disabled: readOptionalBoolean(record.disabled, "disabled"),
    feedback: readOptionalFeedback(record.feedback, "feedback"),
    icon: readOptionalString(record.icon, "icon"),
    method: readMethod(record.method),
    payload,
    placement: readOptionalString(record.placement, "placement"),
    pollIntervalMs: readOptionalNumber(record.pollIntervalMs, "pollIntervalMs"),
    pollTimeoutMs: readOptionalNumber(record.pollTimeoutMs, "pollTimeoutMs"),
    pluginId: targetPluginId,
    resultEffect: readOptionalResultEffect(record.resultEffect, "resultEffect"),
    resultMode: readOptionalString(record.resultMode, "resultMode"),
    tone: readTone(record.tone),
  };
}

function normalizeTargetPluginId(provider: NormalizedActionProviderConfig, pluginId: string) {
  const targetPluginId = normalizePluginId(pluginId);
  if (
    targetPluginId !== provider.pluginId &&
    !provider.allowedTargetPluginIds.includes(targetPluginId)
  ) {
    throw new Error(`${targetPluginId} is not an allowed target for ${provider.pluginId}`);
  }
  return targetPluginId;
}

export function providerFromFieldOptions(
  options: ActionButtonFieldOptions | undefined,
): NormalizedActionProviderConfig {
  const pluginId = optionalFieldString(options?.pluginId ?? options?.provider);
  if (!pluginId)
    throw new Error("Action button field requires options.provider or options.pluginId");

  return {
    allowedTargetPluginIds: (Array.isArray(options?.allowedTargetPluginIds)
      ? options.allowedTargetPluginIds
      : []
    ).map(normalizePluginId),
    label: optionalFieldString(options?.providerLabel),
    manifestRoute: normalizePluginRoute(
      optionalFieldString(options?.manifestRoute) ?? DEFAULT_MANIFEST_ROUTE,
    ),
    pluginId: normalizePluginId(pluginId),
  };
}

export function readRequiredString(value: unknown, field: string) {
  const text = readOptionalString(value, field);
  if (!text) throw new Error(`Action ${field} is required`);
  return text;
}

export function readOptionalString(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`Action ${field} must be a string`);
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > MAX_STRING_LENGTH) {
    throw new Error(`Action ${field} must be ${MAX_STRING_LENGTH} characters or fewer`);
  }
  return text;
}

function readMethod(value: unknown): ActionMethod | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action method must be a string");
  const method = value.trim().toUpperCase();
  if (!ACTION_METHODS.has(method as ActionMethod)) {
    throw new Error(`Unsupported action method: ${value}`);
  }
  return method as ActionMethod;
}

function readTone(value: unknown): ActionTone | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action tone must be a string");
  const tone = value.trim();
  if (!ACTION_TONES.has(tone as ActionTone)) {
    throw new Error(`Unsupported action tone: ${value}`);
  }
  return tone as ActionTone;
}

export function readNullableTone(value: unknown, field: string): ActionTone | null | undefined {
  if (value === null) return null;
  try {
    return readTone(value);
  } catch (error) {
    throw new Error(`${field}: ${errorMessage(error)}`);
  }
}

export function readOpenTarget(value: unknown): ActionResultOpenTarget | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Open target must be a string");
  const target = value.trim();
  if (!ACTION_RESULT_OPEN_TARGETS.has(target as ActionResultOpenTarget)) {
    throw new Error(`Unsupported open target: ${value}`);
  }
  return target as ActionResultOpenTarget;
}

export function readOptionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`Action ${field} must be a boolean`);
  return value;
}

export function readOptionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Action ${field} must be a positive number`);
  }
  return value;
}

export function readPayload(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) throw new Error("Action payload must be an object");
  return record;
}

export function readNullablePayload(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  return readPayload(value);
}

export function readNullableString(value: unknown, field: string) {
  if (value === null) return null;
  return readOptionalString(value, field);
}

export function readOptionalButtonStyle(
  value: unknown,
  field: string,
): ActionButtonStyle | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be an object`);

  const style: ActionButtonStyle = {};
  const color = readOptionalString(record.color, `${field}.color`);
  const backgroundColor = readOptionalString(record.backgroundColor, `${field}.backgroundColor`);
  const borderColor = readOptionalString(record.borderColor, `${field}.borderColor`);
  const darkColor = readOptionalString(record.darkColor, `${field}.darkColor`);
  const darkBackgroundColor = readOptionalString(
    record.darkBackgroundColor,
    `${field}.darkBackgroundColor`,
  );
  const darkBorderColor = readOptionalString(record.darkBorderColor, `${field}.darkBorderColor`);
  const resetStyle = readOptionalBoolean(record.resetStyle, `${field}.resetStyle`);
  if (color) style.color = color;
  if (backgroundColor) style.backgroundColor = backgroundColor;
  if (borderColor) style.borderColor = borderColor;
  if (darkColor) style.darkColor = darkColor;
  if (darkBackgroundColor) style.darkBackgroundColor = darkBackgroundColor;
  if (darkBorderColor) style.darkBorderColor = darkBorderColor;
  if (resetStyle !== undefined) style.resetStyle = resetStyle;
  return Object.keys(style).length > 0 ? style : undefined;
}

export function readOptionalFeedback(
  value: unknown,
  field: string,
): ActionFeedbackOptions | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be an object`);

  const feedback: ActionFeedbackOptions = {};
  const progress = readOptionalString(record.progress, `${field}.progress`);
  const success = readOptionalString(record.success, `${field}.success`);
  const error = readOptionalString(record.error, `${field}.error`);
  const progressStyle = readOptionalButtonStyle(record.progressStyle, `${field}.progressStyle`);
  const successStyle = readOptionalButtonStyle(record.successStyle, `${field}.successStyle`);
  const errorStyle = readOptionalButtonStyle(record.errorStyle, `${field}.errorStyle`);

  if (progress) feedback.progress = progress;
  if (success) feedback.success = success;
  if (error) feedback.error = error;
  if (progressStyle) feedback.progressStyle = progressStyle;
  if (successStyle) feedback.successStyle = successStyle;
  if (errorStyle) feedback.errorStyle = errorStyle;

  return Object.keys(feedback).length > 0 ? feedback : undefined;
}

export function readOptionalResultEffect(
  value: unknown,
  field: string,
): ActionResultEffectPreset | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    const preset = value.trim();
    if (!ACTION_RESULT_EFFECT_PRESETS.has(preset)) {
      throw new Error(`Unsupported action ${field}: ${value}`);
    }
    return preset as ActionResultEffectPreset;
  }

  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be a string or object`);
  const type = readRequiredString(record.type, `${field}.type`);
  if (!ACTION_RESULT_EFFECT_PRESETS.has(type)) {
    throw new Error(`Unsupported action ${field}.type: ${type}`);
  }
  if (type === "open") {
    return {
      type,
      target: readOpenTarget(record.target),
    };
  }
  if (type === "download") {
    return {
      type,
      filename: readOptionalString(record.filename, `${field}.filename`),
    };
  }
  return { type: type as "clipboard" | "copy" };
}

export function readFieldMode(value: unknown): ActionButtonMode {
  if (value === undefined || value === null) return "run";
  if (typeof value !== "string") throw new Error("Action field mode must be a string");
  const mode = value.trim();
  if (!ACTION_BUTTON_MODES.has(mode as ActionButtonMode)) {
    throw new Error(`Unsupported action field mode: ${value}`);
  }
  return mode as ActionButtonMode;
}

export function readFieldMethod(value: unknown): ActionMethod | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action field method must be a string");
  const method = value.trim().toUpperCase();
  if (!ACTION_METHODS.has(method as ActionMethod)) {
    throw new Error(`Unsupported action field method: ${value}`);
  }
  return method as ActionMethod;
}

export function readFieldTone(value: unknown): ActionTone | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action field tone must be a string");
  const tone = value.trim();
  if (!ACTION_TONES.has(tone as ActionTone)) {
    throw new Error(`Unsupported action field tone: ${value}`);
  }
  return tone as ActionTone;
}

export function readOptionalFieldTone(value: unknown): ActionTone | undefined {
  try {
    return readFieldTone(value);
  } catch {
    return undefined;
  }
}

export function optionalFieldString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function positiveFieldNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function hasJsonBody(method: ActionMethod) {
  return method !== "DELETE";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

export function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function readPath(value: unknown, path: string) {
  let current = value;
  for (const segment of path.split(".")) {
    if (!segment) return undefined;
    const record = asRecord(current);
    if (!record || !Object.hasOwn(record, segment)) return undefined;
    current = record[segment];
  }
  return current;
}

export function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeProviderConfig(
  provider: ActionProviderConfig,
): NormalizedActionProviderConfig {
  const pluginId = normalizePluginId(provider.pluginId);
  return {
    ...provider,
    pluginId,
    allowedTargetPluginIds: (provider.allowedTargetPluginIds ?? []).map(normalizePluginId),
    manifestRoute: normalizePluginRoute(provider.manifestRoute?.trim() || DEFAULT_MANIFEST_ROUTE),
  };
}
