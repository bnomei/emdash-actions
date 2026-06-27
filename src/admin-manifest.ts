/**
 * Manifest parsing, field-option normalization, and shared readers for action
 * descriptors returned by provider plugins.
 *
 * Parse-time validation is strict: malformed manifests throw before actions
 * reach the admin UI; tolerant readers elsewhere handle partial result patches.
 */
import { DEFAULT_MANIFEST_ROUTE, normalizePluginId, normalizePluginRoute } from "./shared";
import type {
  ActionButtonFieldOptions,
  ActionButtonMode,
  ActionButtonStyle,
  ActionDescriptorMode,
  ActionFeedbackOptions,
  ActionFormField,
  ActionFormFieldType,
  ActionFormMetadata,
  ActionFormOption,
  ActionFormOptionValue,
  ActionInputField,
  ActionInputMetadata,
  ActionInputType,
  ActionManifestDescriptor,
  ActionMethod,
  ActionProviderConfig,
  ActionResultEffectPreset,
  ActionResultOpenTarget,
  ActionRunnerMetadata,
  ActionTargetMetadata,
  ActionTargetType,
  ActionsManifest,
  ActionTone,
  NormalizedActionProviderConfig,
} from "./types";
import type { LocalizedString } from "./i18n";

const ACTION_METHODS = new Set<ActionMethod>(["POST", "PUT", "PATCH", "DELETE"]);
const ACTION_BUTTON_MODES = new Set<ActionButtonMode>(["run", "clipboard"]);
const ACTION_DESCRIPTOR_MODES = new Set<ActionDescriptorMode>(["direct", "runner"]);
const ACTION_TARGET_TYPES = new Set<ActionTargetType>(["dashboard", "entry", "field", "row"]);
const ACTION_FORM_FIELD_TYPES = new Set<ActionFormFieldType>([
  "string",
  "number",
  "integer",
  "boolean",
  "datetime",
  "select",
]);
const ACTION_INPUT_TYPES = new Set<ActionInputType>([
  "string",
  "number",
  "integer",
  "boolean",
  "datetime",
  "select",
  "json",
]);
const ACTION_TONES = new Set<ActionTone>(["default", "positive", "warning", "danger", "info"]);
const ACTION_RESULT_EFFECT_PRESETS = new Set(["clipboard", "copy", "open", "download"]);
const ACTION_RESULT_OPEN_TARGETS = new Set<ActionResultOpenTarget>(["self", "blank"]);
const ACTION_FORM_MODES = new Set<ActionFormMetadata["mode"]>(["inline"]);
const MAX_ACTIONS_PER_PROVIDER = 50;
const MAX_STRING_LENGTH = 220;
const ACTION_FORM_FIELD_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]{0,127}$/;

/** Parses and validates a provider manifest payload into typed action descriptors. */
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
): ActionManifestDescriptor {
  const record = asRecord(value);
  if (!record) throw new Error(`Action at index ${index} must be an object`);

  const mode = readActionDescriptorMode(record.mode);
  const payload = readPayload(record.payload);
  const runner = readOptionalRunner(record.runner, "runner");
  const target = readOptionalTargetMetadata(record.target, "target");
  const form = readOptionalForm(record.form, "form");
  const input = readOptionalInput(record.input, "input");
  const isRunner = runner !== undefined || mode === "runner";
  if (runner !== undefined && mode === "direct") {
    throw new Error("Runner action must not use direct mode");
  }

  const action = {
    id: readRequiredString(record.id, "id"),
    label: readRequiredLocalizedString(record.label, "label"),
    confirm: readOptionalLocalizedString(record.confirm, "confirm"),
    contextKey: readOptionalString(record.contextKey, "contextKey"),
    contextValueKey: readOptionalString(record.contextValueKey, "contextValueKey"),
    buttonStyle: readOptionalButtonStyle(record.buttonStyle, "buttonStyle"),
    cooldownMs: readOptionalNumber(record.cooldownMs, "cooldownMs"),
    description: readOptionalLocalizedString(record.description, "description"),
    disabled: readOptionalBoolean(record.disabled, "disabled"),
    feedback: readOptionalFeedback(record.feedback, "feedback"),
    icon: readOptionalString(record.icon, "icon"),
    form,
    input,
    payload,
    placement: readOptionalString(record.placement, "placement"),
    pollIntervalMs: readOptionalNumber(record.pollIntervalMs, "pollIntervalMs"),
    pollTimeoutMs: readOptionalNumber(record.pollTimeoutMs, "pollTimeoutMs"),
    resultEffect: readOptionalResultEffect(record.resultEffect, "resultEffect"),
    resultMode: readOptionalString(record.resultMode, "resultMode"),
    target,
    tone: readTone(record.tone),
  };

  if (isRunner) {
    if (record.route !== undefined && record.route !== null) {
      throw new Error("Runner action must not define route");
    }
    if (record.method !== undefined && record.method !== null) {
      throw new Error("Runner action must not define method");
    }
    if (record.pluginId !== undefined && record.pluginId !== null) {
      throw new Error("Runner action must not define pluginId");
    }
    return {
      ...action,
      ...(mode === "runner" ? { mode } : {}),
      runner: runner ?? true,
    };
  }

  const pluginId = readOptionalString(record.pluginId, "pluginId");
  const targetPluginId = pluginId ? normalizeTargetPluginId(provider, pluginId) : undefined;

  return {
    ...action,
    ...(mode ? { mode } : {}),
    method: readMethod(record.method),
    pluginId: targetPluginId,
    route: normalizePluginRoute(readRequiredString(record.route, "route")),
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
    label: optionalFieldLocalizedString(options?.providerLabel),
    manifestRoute: normalizePluginRoute(
      optionalFieldString(options?.manifestRoute) ?? DEFAULT_MANIFEST_ROUTE,
    ),
    ...(options?.runnerRoute
      ? { runnerRoute: normalizePluginRoute(optionalFieldString(options.runnerRoute) ?? "") }
      : {}),
    pluginId: normalizePluginId(pluginId),
  };
}

export function readRequiredString(value: unknown, field: string) {
  const text = readOptionalString(value, field);
  if (!text) throw new Error(`Action ${field} is required`);
  return text;
}

export function readRequiredLocalizedString(value: unknown, field: string) {
  const text = readOptionalLocalizedString(value, field);
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

export function readOptionalLocalizedString(
  value: unknown,
  field: string,
): LocalizedString | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return readOptionalString(value, field);

  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be a string or locale map`);

  const localized: Record<string, string> = {};
  for (const [locale, text] of Object.entries(record)) {
    const normalizedLocale = locale.trim();
    if (!normalizedLocale) throw new Error(`Action ${field} locale must not be empty`);
    const normalizedText = readOptionalString(text, `${field}.${normalizedLocale}`);
    if (normalizedText) localized[normalizedLocale] = normalizedText;
  }

  return Object.keys(localized).length > 0 ? localized : undefined;
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

function readActionDescriptorMode(value: unknown): ActionDescriptorMode | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action mode must be a string");
  const mode = value.trim();
  if (!ACTION_DESCRIPTOR_MODES.has(mode as ActionDescriptorMode)) {
    throw new Error(`Unsupported action mode: ${value}`);
  }
  return mode as ActionDescriptorMode;
}

function readTargetType(value: unknown, field: string): ActionTargetType {
  if (typeof value !== "string") throw new Error(`Action ${field} must be a string`);
  const targetType = value.trim();
  if (!ACTION_TARGET_TYPES.has(targetType as ActionTargetType)) {
    throw new Error(`Unsupported action ${field}: ${value}`);
  }
  return targetType as ActionTargetType;
}

function readOptionalRunner(
  value: unknown,
  field: string,
): true | ActionRunnerMetadata | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === true) return true;
  if (value !== false) {
    const record = asRecord(value);
    if (!record) throw new Error(`Action ${field} must be true or an object`);
    const route = readOptionalString(record.route, `${field}.route`);
    return route ? { route: normalizePluginRoute(route) } : {};
  }
  throw new Error(`Action ${field} must be true or an object`);
}

function readOptionalTargetMetadata(
  value: unknown,
  field: string,
): ActionTargetMetadata | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return { surfaces: [readTargetType(value, field)] };
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error(`Action ${field} must list at least one surface; omit it for no restriction`);
    }
    return {
      surfaces: [...new Set(value.map((item, index) => readTargetType(item, `${field}.${index}`)))],
    };
  }

  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be a string, array, or object`);

  const target: ActionTargetMetadata = {};
  const surfaces = readOptionalTargetSurfaces(record.surfaces, `${field}.surfaces`);
  const kind = readOptionalString(record.kind, `${field}.kind`);
  const required = readOptionalBoolean(record.required, `${field}.required`);
  const idKeys = readOptionalStringArray(record.idKeys, `${field}.idKeys`);
  const idFrom = readOptionalString(record.idFrom, `${field}.idFrom`);

  if (surfaces) target.surfaces = surfaces;
  if (kind) target.kind = kind;
  if (required !== undefined) target.required = required;
  if (idKeys) target.idKeys = idKeys;
  if (idFrom) target.idFrom = idFrom;
  return Object.keys(target).length > 0 ? target : {};
}

function readOptionalTargetSurfaces(
  value: unknown,
  field: string,
): readonly ActionTargetType[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`Action ${field} must be an array`);
  if (value.length === 0) {
    throw new Error(`Action ${field} must list at least one surface; omit it for no restriction`);
  }
  return [...new Set(value.map((item, index) => readTargetType(item, `${field}.${index}`)))];
}

function readOptionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`Action ${field} must be an array`);
  return value.map((item, index) => readRequiredString(item, `${field}.${index}`));
}

function readOptionalForm(value: unknown, field: string): ActionFormMetadata | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be an object`);

  const mode = readFormMode(record.mode, `${field}.mode`);
  const fields = readFormFields(record.fields, `${field}.fields`);
  const submitLabel = readOptionalLocalizedString(record.submitLabel, `${field}.submitLabel`);
  return {
    mode,
    fields,
    ...(submitLabel ? { submitLabel } : {}),
  };
}

function readOptionalInput(value: unknown, field: string): ActionInputMetadata | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) throw new Error(`Action ${field} must be an object`);
  const fields = readOptionalInputFields(record.fields, `${field}.fields`);
  return fields ? { fields } : {};
}

function readOptionalInputFields(
  value: unknown,
  field: string,
): readonly ActionInputField[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`Action ${field} must be an array`);

  return value.map((item, index) => {
    const record = asRecord(item);
    if (!record) throw new Error(`Action ${field}.${index} must be an object`);

    const input: ActionInputField = {
      name: readRequiredString(record.name, `${field}.${index}.name`),
    };
    const label = readOptionalLocalizedString(record.label, `${field}.${index}.label`);
    const description = readOptionalLocalizedString(
      record.description,
      `${field}.${index}.description`,
    );
    const type = readOptionalInputType(record.type, `${field}.${index}.type`);
    const required = readOptionalBoolean(record.required, `${field}.${index}.required`);

    if (label) input.label = label;
    if (description) input.description = description;
    if (type) input.type = type;
    if (required !== undefined) input.required = required;
    if (Object.hasOwn(record, "default")) input.default = record.default;

    return input;
  });
}

function readFormMode(value: unknown, field: string): ActionFormMetadata["mode"] {
  if (value === undefined || value === null) return "inline";
  if (typeof value !== "string") throw new Error(`Action ${field} must be a string`);
  const mode = value.trim();
  if (!ACTION_FORM_MODES.has(mode as ActionFormMetadata["mode"])) {
    throw new Error(`Unsupported action ${field}: ${value}`);
  }
  return mode as ActionFormMetadata["mode"];
}

function readFormFields(value: unknown, field: string): readonly ActionFormField[] {
  if (!Array.isArray(value)) throw new Error(`Action ${field} must be an array`);

  return value.map((item, index) => {
    const record = asRecord(item);
    if (!record) throw new Error(`Action ${field}.${index} must be an object`);

    const name = readRequiredString(record.name, `${field}.${index}.name`);
    if (!ACTION_FORM_FIELD_NAME_PATTERN.test(name)) {
      throw new Error(`Action ${field}.${index}.name is invalid`);
    }

    const input: ActionFormField = {
      name,
    };
    const label = readOptionalLocalizedString(record.label, `${field}.${index}.label`);
    const description = readOptionalLocalizedString(
      record.description,
      `${field}.${index}.description`,
    );
    const type = readOptionalFormFieldType(record.type, `${field}.${index}.type`);
    const required = readOptionalBoolean(record.required, `${field}.${index}.required`);
    const options = readOptionalFormOptions(record.options, `${field}.${index}.options`);

    if (label) input.label = label;
    if (description) input.description = description;
    if (type) input.type = type;
    if (required !== undefined) input.required = required;
    if (options) input.options = options;
    if (Object.hasOwn(record, "default")) input.default = record.default;
    if ((input.type ?? "string") === "select" && (!input.options || input.options.length === 0)) {
      throw new Error(`Action ${field}.${index}.options is required for select fields`);
    }
    // Reject defaults the submit validator would reject so untouched forms stay submittable.
    if (
      Object.hasOwn(input, "default") &&
      !isMissingFormFieldValue(input.default) &&
      !isValidFormFieldValue(input, input.default)
    ) {
      throw new Error(`Action ${field}.${index}.default is not valid for this field`);
    }

    return input;
  });
}

export function formOptionValue(option: NonNullable<ActionFormField["options"]>[number]) {
  return typeof option === "object" && option !== null ? option.value : option;
}

export function isMissingFormFieldValue(value: unknown) {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && !value.trim();
}

/** Submit-time form value gate; shared with parse-time default validation. */
export function isValidFormFieldValue(field: ActionFormField, value: unknown) {
  const type = field.type ?? "string";
  if (type === "number") return Number.isFinite(typeof value === "number" ? value : Number(value));
  if (type === "integer") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isInteger(number);
  }
  if (type === "boolean") return typeof value === "boolean";
  if (type === "select" && field.options) {
    return field.options.some(
      (option) => formOptionValue(option) === value || String(formOptionValue(option)) === value,
    );
  }
  return true;
}

function readOptionalFormOptions(
  value: unknown,
  field: string,
): readonly ActionFormOption[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error(`Action ${field} must be an array`);
  return value.map((item, index) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      return { value: item };
    }

    const record = asRecord(item);
    if (!record) throw new Error(`Action ${field}.${index} must be a scalar or object`);
    const value = readFormOptionValue(record.value, `${field}.${index}.value`);
    const label = readOptionalLocalizedString(record.label, `${field}.${index}.label`);
    return label ? { label, value } : { value };
  });
}

function readFormOptionValue(value: unknown, field: string): ActionFormOptionValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new Error(`Action ${field} must be a string, number, or boolean`);
}

function readOptionalFormFieldType(value: unknown, field: string): ActionFormFieldType | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`Action ${field} must be a string`);
  const inputType = value.trim();
  if (!ACTION_FORM_FIELD_TYPES.has(inputType as ActionFormFieldType)) {
    throw new Error(`Unsupported action ${field}: ${value}`);
  }
  return inputType as ActionFormFieldType;
}

function readOptionalInputType(value: unknown, field: string): ActionInputType | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`Action ${field} must be a string`);
  const inputType = value.trim();
  if (!ACTION_INPUT_TYPES.has(inputType as ActionInputType)) {
    throw new Error(`Unsupported action ${field}: ${value}`);
  }
  return inputType as ActionInputType;
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

export function readNullableLocalizedString(value: unknown, field: string) {
  if (value === null) return null;
  return readOptionalLocalizedString(value, field);
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
  const progress = readOptionalLocalizedString(record.progress, `${field}.progress`);
  const success = readOptionalLocalizedString(record.success, `${field}.success`);
  const error = readOptionalLocalizedString(record.error, `${field}.error`);
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

export function optionalFieldLocalizedString(value: unknown): LocalizedString | undefined {
  if (typeof value === "string") return optionalFieldString(value);
  const record = asRecord(value);
  if (!record) return undefined;

  const localized: Record<string, string> = {};
  for (const [locale, text] of Object.entries(record)) {
    if (typeof text === "string" && text.trim() && locale.trim()) {
      localized[locale.trim()] = text.trim();
    }
  }
  return Object.keys(localized).length > 0 ? localized : undefined;
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
    ...(provider.runnerRoute
      ? { runnerRoute: normalizePluginRoute(provider.runnerRoute.trim()) }
      : {}),
  };
}
