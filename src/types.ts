export type ActionMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type ActionTone = "default" | "positive" | "warning" | "danger" | "info";
export type ActionWidgetSize = "full" | "half" | "third";
export type ActionButtonMode = "run" | "clipboard";
export type ActionSurface = "field" | "dashboard";
export type ActionResultMode = "emdash-action-result-v1" | "emdash-action-accepted-v1";
export type ActionToastType = ActionTone | "success" | "error";
export type ActionResultOpenTarget = "self" | "blank";
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
    defaultLocale?: string;
    locales?: string[];
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
  progress?: string;
  success?: string;
  error?: string;
  progressStyle?: ActionButtonStyle;
  successStyle?: ActionButtonStyle;
  errorStyle?: ActionButtonStyle;
}

export interface ActionResultActionPatch {
  label?: string;
  icon?: string | null;
  tone?: ActionTone | null;
  description?: string | null;
  disabled?: boolean;
  confirm?: string | null;
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
  title?: string;
  message?: string;
  id?: string;
  timeoutMs?: number;
}

export interface ActionProviderConfig {
  pluginId: string;
  label?: string;
  manifestRoute?: string;
  allowedTargetPluginIds?: string[];
}

export interface NormalizedActionProviderConfig extends ActionProviderConfig {
  manifestRoute: string;
  allowedTargetPluginIds: string[];
}

export interface ActionDescriptor {
  id: string;
  label: string;
  route: string;
  method?: ActionMethod;
  pluginId?: string;
  description?: string;
  icon?: string;
  tone?: ActionTone;
  confirm?: string;
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
}

export interface ActionButtonFieldOptions {
  mode?: ActionButtonMode;
  provider?: string;
  pluginId?: string;
  providerLabel?: string;
  action?: string;
  route?: string;
  method?: ActionMethod;
  label?: string;
  description?: string;
  icon?: string;
  tone?: ActionTone;
  confirm?: string;
  placement?: string;
  manifestRoute?: string;
  allowedTargetPluginIds?: string[];
  payload?: Record<string, unknown>;
  valueKey?: string;
  contextKey?: string;
  contextValueKey?: string;
  resultValueKey?: string;
  clipboardText?: string;
  clipboardValueKey?: string;
  clipboardContextValueKey?: string;
  clipboardSuccess?: string;
  disabled?: boolean;
  cooldownMs?: number;
  buttonStyle?: ActionButtonStyle;
  feedback?: ActionFeedbackOptions;
  resultEffect?: ActionResultEffectPreset;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface ActionsManifest {
  actions: ActionDescriptor[];
}

export interface ActionsProvidersResponse {
  placement: string | null;
  providers: NormalizedActionProviderConfig[];
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
}

export interface ActionsCreatePluginOptions {
  adminEntry?: string;
  providers?: ActionProviderConfig[];
  placement?: string | null;
  title?: string;
  size?: ActionWidgetSize;
}
