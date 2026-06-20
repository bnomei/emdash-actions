import type { ActionsI18nConfig, LocalizedString } from "./i18n";

export type ActionMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type ActionTone = "default" | "positive" | "warning" | "danger" | "info";
export type ActionWidgetSize = "full" | "half" | "third";
export type ActionButtonMode = "run" | "clipboard";
export type ActionSurface = "field" | "dashboard" | "entry" | "row";
export type ActionDescriptorMode = "direct" | "runner";
export type ActionResultMode = "emdash-action-result-v1" | "emdash-action-accepted-v1";
export type ActionToastType = ActionTone | "success" | "error";
export type ActionResultOpenTarget = "self" | "blank";
export type ActionTarget =
  | { type: "dashboard" }
  | { type: "entry"; collection: string; entryId: string; locale?: string | null }
  | {
      type: "field";
      collection?: string;
      entryId?: string;
      locale?: string | null;
      fieldName?: string;
      value?: unknown;
    }
  | {
      type: "row";
      collection?: string;
      entryId?: string;
      locale?: string | null;
      fieldName?: string;
      rowId?: string;
      row?: Record<string, unknown>;
    };
export type ActionTargetType = ActionTarget["type"];
export type ActionTargetRequirement = ActionTargetType | ActionTargetType[];
export type ActionInputType = "string" | "number" | "boolean" | "json";
export interface ActionInputField {
  name: string;
  label?: LocalizedString;
  description?: LocalizedString;
  type?: ActionInputType;
  required?: boolean;
  default?: unknown;
}
export interface ActionInputMetadata {
  fields?: ActionInputField[];
}
export interface ActionInvocation {
  actionId: string;
  payload?: Record<string, unknown>;
  context?: ActionButtonContext;
  target?: ActionTarget;
}
export type ActionResultEffectPreset =
  | "clipboard"
  | "copy"
  | "open"
  | "download"
  | { type: "clipboard" | "copy" }
  | { type: "open"; target?: ActionResultOpenTarget }
  | { type: "download"; filename?: string };
export type ActionJobStatus =
  | "accepted"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface ActionButtonContext {
  surface: ActionSurface;
  collection?: string;
  collectionLabel?: string;
  fieldName?: string;
  fieldKind?: string;
  fieldLabel?: string;
  fieldRequired?: boolean;
  entryId?: string;
  entrySlug?: string;
  entryStatus?: string;
  entryLocale?: string | null;
  isNew?: boolean;
  fieldValue?: unknown;
  entryData?: Record<string, unknown>;
  currentUser?: {
    id: string;
    role?: number;
    [key: string]: unknown;
  };
  i18n?: {
    locale?: string;
    defaultLocale?: string;
    locales?: string[];
    fallback?: Record<string, string>;
    [key: string]: unknown;
  };
  translations?: unknown[];
  formData?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ActionButtonStyle {
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  darkColor?: string;
  darkBackgroundColor?: string;
  darkBorderColor?: string;
  resetStyle?: boolean;
}

export interface ActionFeedbackOptions {
  progress?: LocalizedString;
  success?: LocalizedString;
  error?: LocalizedString;
  progressStyle?: ActionButtonStyle;
  successStyle?: ActionButtonStyle;
  errorStyle?: ActionButtonStyle;
}

export interface ActionResultActionPatch {
  label?: LocalizedString;
  icon?: string | null;
  tone?: ActionTone | null;
  description?: LocalizedString | null;
  disabled?: boolean;
  confirm?: LocalizedString | null;
  payload?: Record<string, unknown> | null;
}

export interface ActionResultEffects {
  reload?: boolean | { delayMs?: number };
  open?: string | { url: string; target?: ActionResultOpenTarget };
  download?: string | { url?: string; route?: string; filename?: string };
  clipboard?: string | { text: string };
}

export interface ActionToast {
  type?: ActionToastType;
  title?: LocalizedString;
  message?: LocalizedString;
  id?: string;
  timeoutMs?: number;
}

export interface ActionProviderConfig {
  pluginId: string;
  label?: LocalizedString;
  manifestRoute?: string;
  runnerRoute?: string;
  allowedTargetPluginIds?: string[];
}

export interface NormalizedActionProviderConfig extends ActionProviderConfig {
  manifestRoute: string;
  allowedTargetPluginIds: string[];
}

export interface ActionDescriptorBase {
  id: string;
  label: LocalizedString;
  description?: LocalizedString;
  icon?: string;
  tone?: ActionTone;
  confirm?: LocalizedString;
  placement?: string;
  resultMode?: ActionResultMode | (string & {});
  payload?: Record<string, unknown>;
  contextKey?: string;
  contextValueKey?: string;
  disabled?: boolean;
  cooldownMs?: number;
  buttonStyle?: ActionButtonStyle;
  feedback?: ActionFeedbackOptions;
  resultEffect?: ActionResultEffectPreset;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  target?: ActionTargetRequirement;
  input?: ActionInputMetadata;
}

export interface ActionDescriptor extends ActionDescriptorBase {
  mode?: "direct";
  route: string;
  method?: ActionMethod;
  pluginId?: string;
}

export type DirectActionDescriptor = ActionDescriptor;

export interface RunnerActionDescriptor extends ActionDescriptorBase {
  mode: "runner";
  method?: never;
  pluginId?: never;
  route?: never;
}

export type ActionManifestDescriptor = ActionDescriptor | RunnerActionDescriptor;

export interface ActionButtonFieldOptions {
  mode?: ActionButtonMode;
  provider?: string;
  pluginId?: string;
  providerLabel?: LocalizedString;
  action?: string;
  route?: string;
  method?: ActionMethod;
  label?: LocalizedString;
  description?: LocalizedString;
  icon?: string;
  tone?: ActionTone;
  confirm?: LocalizedString;
  placement?: string;
  manifestRoute?: string;
  runnerRoute?: string;
  allowedTargetPluginIds?: string[];
  payload?: Record<string, unknown>;
  valueKey?: string;
  contextKey?: string;
  contextValueKey?: string;
  resultValueKey?: string;
  clipboardText?: string;
  clipboardValueKey?: string;
  clipboardContextValueKey?: string;
  clipboardSuccess?: LocalizedString;
  disabled?: boolean;
  cooldownMs?: number;
  buttonStyle?: ActionButtonStyle;
  feedback?: ActionFeedbackOptions;
  resultEffect?: ActionResultEffectPreset;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  i18n?: ActionsI18nConfig;
}

export interface ActionsManifest {
  actions: ActionManifestDescriptor[];
}

export interface ActionsProvidersResponse {
  placement: string | null;
  providers: NormalizedActionProviderConfig[];
  i18n?: ActionsI18nConfig;
}

export interface ActionRunResult {
  ok?: boolean;
  status?: number;
  severity?: ActionTone | "success" | "error";
  jobId?: string;
  jobStatus?: ActionJobStatus | (string & {});
  progress?: number;
  pollAfterMs?: number;
  statusRoute?: string;
  message?: string;
  success?: string;
  error?: string;
  label?: string;
  icon?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  darkColor?: string;
  darkBackgroundColor?: string;
  darkBorderColor?: string;
  resetStyle?: boolean;
  action?: ActionResultActionPatch;
  effects?: ActionResultEffects;
  reload?: ActionResultEffects["reload"];
  open?: ActionResultEffects["open"];
  download?: ActionResultEffects["download"];
  clipboard?: ActionResultEffects["clipboard"];
  toast?: ActionToast | ActionToast[] | false;
  notification?: ActionToast | ActionToast[];
  [key: string]: unknown;
}

export interface ActionsDescriptorOptions {
  entrypoint?: string;
  adminEntry?: string;
  providers?: ActionProviderConfig[];
  placement?: string | null;
  title?: string;
  size?: ActionWidgetSize;
  i18n?: ActionsI18nConfig;
}

export interface ActionsCreatePluginOptions {
  adminEntry?: string;
  providers?: ActionProviderConfig[];
  placement?: string | null;
  title?: string;
  size?: ActionWidgetSize;
  i18n?: ActionsI18nConfig;
}
