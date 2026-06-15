import { Badge, Banner, Button, Empty, LayerCard, Loader, Text } from "@cloudflare/kumo";
import {
  CheckCircleIcon,
  ClipboardTextIcon,
  LightningIcon,
  PlayIcon,
  PowerIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { apiFetch, parseApiResponse } from "emdash/plugin-utils";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  DEFAULT_MANIFEST_ROUTE,
  PLUGIN_ID,
  WIDGET_ID,
  normalizePluginId,
  normalizePluginRoute,
  pluginRoute,
  providerPluginRoute,
} from "./shared";
import type {
  ActionButtonMode,
  ActionButtonContext,
  ActionButtonFieldOptions,
  ActionDescriptor,
  ActionJobStatus,
  ActionMethod,
  ActionProviderConfig,
  ActionRunResult,
  ActionsManifest,
  ActionsProvidersResponse,
  ActionTone,
  NormalizedActionProviderConfig,
} from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; actions: UiAction[]; errors: ProviderError[] };

type UiAction = ActionDescriptor & {
  key: string;
  provider: NormalizedActionProviderConfig;
  targetPluginId: string;
};

type ProviderError = {
  provider: ActionProviderConfig;
  message: string;
};

type FieldContextInput = {
  id?: string;
  label?: string;
  required?: boolean;
  value: unknown;
};

type EntryContextRoute = {
  collection?: string;
  entryId?: string;
  entryLocale?: string | null;
  isNew?: boolean;
};

type EntryContextItem = {
  id?: string;
  slug?: string | null;
  status?: string | null;
  locale?: string | null;
  data?: unknown;
};

type CurrentUserContext = {
  id: string;
  role?: number;
  [key: string]: unknown;
};

type NoticeTone = ActionTone | "error" | "success";

type Notice = {
  tone: NoticeTone;
  message: string;
} | null;

type FieldWidgetProps<TOptions = Record<string, unknown>> = {
  value: unknown;
  onChange: (value: unknown) => void;
  label?: string;
  id?: string;
  required?: boolean;
  options?: TOptions;
  minimal?: boolean;
  context?: ActionButtonContext;
};

type DashboardWidgetProps = {
  context?: ActionButtonContext;
};

const ACTION_METHODS = new Set<ActionMethod>(["POST", "PUT", "PATCH", "DELETE"]);
const ACTION_BUTTON_MODES = new Set<ActionButtonMode>(["run", "clipboard"]);
const ACTION_TONES = new Set<ActionTone>(["default", "positive", "warning", "danger", "info"]);
const PENDING_JOB_STATUSES = new Set<string>(["accepted", "queued", "running"]);
const FAILED_JOB_STATUSES = new Set<string>(["failed", "cancelled"]);
const MAX_ACTIONS_PER_PROVIDER = 50;
const MAX_STRING_LENGTH = 220;
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 30000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;
const MAX_POLL_TIMEOUT_MS = 900000;

const shellStyle = {
  display: "grid",
  gap: "0.85rem",
  minWidth: 0,
  paddingBlockStart: "0.5rem",
} satisfies CSSProperties;

const loadingStyle = {
  alignItems: "center",
  display: "flex",
  gap: "0.5rem",
} satisfies CSSProperties;

const actionListStyle = {
  display: "grid",
  gap: "0.65rem",
} satisfies CSSProperties;

const actionRowContentStyle = {
  display: "grid",
  gap: "0.65rem",
} satisfies CSSProperties;

const actionHeaderStyle = {
  alignItems: "flex-start",
  display: "flex",
  gap: "0.75rem",
  justifyContent: "space-between",
  minWidth: 0,
} satisfies CSSProperties;

const actionTextStyle = {
  display: "grid",
  gap: "0.25rem",
  minWidth: 0,
} satisfies CSSProperties;

const footerStyle = {
  display: "grid",
  gap: "0.45rem",
} satisfies CSSProperties;

const fieldShellStyle = {
  display: "grid",
  gap: "0.65rem",
  minWidth: 0,
} satisfies CSSProperties;

const fieldHeaderStyle = {
  display: "grid",
  gap: "0.2rem",
  minWidth: 0,
} satisfies CSSProperties;

function ActionsWidget({ context }: DashboardWidgetProps = {}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const providers = await apiGet<ActionsProvidersResponse>("providers");
        const result = await loadProviderActions(providers);
        if (!active) return;
        setState({ status: "ready", ...result });
      } catch (error) {
        if (!active) return;
        setState({ status: "error", message: errorMessage(error) });
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function runAction(action: UiAction) {
    if (action.confirm && !globalThis.confirm(action.confirm)) return;

    setBusyKey(action.key);
    setNotice(null);
    try {
      const actionContext = await contextForAction(action, context, resolveDashboardContext);
      const result = await callAction<ActionRunResult>(action, actionContext);
      const finalResult = await waitForActionResult(action, result, (progress) => {
        setNotice(noticeFromResult(action, progress));
      });
      setNotice(noticeFromResult(action, finalResult, `${action.label} finished.`));
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusyKey(null);
    }
  }

  if (state.status === "loading") {
    return (
      <WidgetShell>
        <div style={loadingStyle}>
          <Loader size="sm" />
          <Text size="sm" variant="secondary">
            Loading actions...
          </Text>
        </div>
      </WidgetShell>
    );
  }

  if (state.status === "error") {
    return (
      <WidgetShell>
        <Banner title={state.message} variant="error" />
      </WidgetShell>
    );
  }

  return (
    <WidgetShell>
      {notice ? (
        <Banner
          icon={noticeIcon(notice.tone)}
          title={notice.message}
          variant={bannerVariant(notice.tone)}
        />
      ) : null}

      {state.actions.length > 0 ? (
        <div style={actionListStyle}>
          {state.actions.map((action) => (
            <LayerCard key={action.key}>
              <LayerCard.Primary>
                <div style={actionRowContentStyle}>
                  <div style={actionHeaderStyle}>
                    <div style={actionTextStyle}>
                      <Text size="sm">{action.label}</Text>
                      {action.description ? (
                        <Text size="xs" variant="secondary">
                          {action.description}
                        </Text>
                      ) : null}
                    </div>
                    <Badge variant="secondary">
                      {action.provider.label ?? action.provider.pluginId}
                    </Badge>
                  </div>
                  <Button
                    disabled={busyKey !== null || action.disabled === true}
                    icon={actionIcon(action)}
                    loading={busyKey === action.key}
                    onClick={() => void runAction(action)}
                    type="button"
                    variant={buttonVariant(action.tone)}
                  >
                    {action.label}
                  </Button>
                </div>
              </LayerCard.Primary>
            </LayerCard>
          ))}
        </div>
      ) : (
        <Empty
          description="Configure at least one provider to show action buttons."
          icon={<LightningIcon size={32} />}
          size="sm"
          title="No actions configured"
        />
      )}

      {state.errors.length > 0 ? (
        <div style={footerStyle}>
          {state.errors.map((error) => (
            <Text key={error.provider.pluginId} size="xs" variant="error">
              {error.provider.label ?? error.provider.pluginId}: {error.message}
            </Text>
          ))}
        </div>
      ) : null}
    </WidgetShell>
  );
}

function WidgetShell({ children }: { children: ReactNode }) {
  return <div style={shellStyle}>{children}</div>;
}

export function ActionButtonField({
  value,
  onChange,
  label,
  id,
  required,
  options,
  minimal,
  context,
}: FieldWidgetProps<ActionButtonFieldOptions>) {
  const [mode, setMode] = useState<ActionButtonMode>("run");
  const [action, setAction] = useState<UiAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const nextMode = readFieldMode(options?.mode);
        setMode(nextMode);

        if (nextMode === "clipboard") {
          if (!active) return;
          setAction(null);
          setError(null);
          return;
        }

        const resolved = await resolveFieldAction(options, value, label);
        if (!active) return;
        setAction(resolved);
        setError(null);
      } catch (loadError) {
        if (!active) return;
        setMode("run");
        setAction(null);
        setError(errorMessage(loadError));
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [label, options, value]);

  async function runFieldAction() {
    if (mode === "clipboard") {
      await copyFieldClipboardValue();
      return;
    }

    if (!action) return;
    if (action.confirm && !globalThis.confirm(action.confirm)) return;

    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const actionContext = await contextForAction(action, context, () =>
        resolveFieldContext(context, { id, label, required, value }),
      );
      const result = await callAction<ActionRunResult>(action, actionContext);
      const finalResult = await waitForActionResult(action, result, (progress) => {
        setNotice(noticeFromResult(action, progress));
      });
      setNotice(noticeFromResult(action, finalResult, `${action.label} finished.`));
      applyFieldResultValue(finalResult, options, onChange);
    } catch (runError) {
      setNotice({ tone: "error", message: errorMessage(runError) });
    } finally {
      setBusy(false);
    }
  }

  async function copyFieldClipboardValue() {
    if (options?.confirm && !globalThis.confirm(options.confirm)) return;

    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const clipboardContext = optionalFieldString(options?.clipboardContextValueKey)
        ? await resolveFieldContext(context, { id, label, required, value })
        : context;
      const text = clipboardText(options, value, clipboardContext);
      await writeClipboardText(text);
      setNotice({
        tone: "success",
        message: optionalFieldString(options?.clipboardSuccess) ?? "Copied to clipboard.",
      });
    } catch (copyError) {
      setNotice({ tone: "error", message: errorMessage(copyError) });
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = options?.label ?? action?.label ?? label ?? fieldDefaultButtonLabel(mode);
  const description = options?.description ?? action?.description;
  const disabled = busy || options?.disabled === true || (mode === "run" && !action);

  return (
    <div id={id} style={fieldShellStyle}>
      {!minimal ? (
        <div style={fieldHeaderStyle}>
          <Text size="sm">{label ?? buttonLabel}</Text>
          {description ? (
            <Text size="xs" variant="secondary">
              {description}
            </Text>
          ) : null}
        </div>
      ) : null}

      {error ? <Banner title={error} variant="error" /> : null}
      {notice ? (
        <Banner
          icon={noticeIcon(notice.tone)}
          title={notice.message}
          variant={bannerVariant(notice.tone)}
        />
      ) : null}

      <Button
        disabled={disabled || action?.disabled === true}
        icon={fieldButtonIcon(mode, action, options)}
        loading={busy}
        onClick={() => void runFieldAction()}
        type="button"
        variant={buttonVariant(action?.tone ?? readOptionalFieldTone(options?.tone))}
      >
        {buttonLabel}
      </Button>
    </div>
  );
}

async function loadProviderActions(response: ActionsProvidersResponse) {
  const results = await Promise.all(
    response.providers.map(async (provider) => {
      try {
        const manifest = await fetchManifest(provider);
        return { manifest, provider };
      } catch (error) {
        return { error: errorMessage(error), provider };
      }
    }),
  );

  const actions: UiAction[] = [];
  const errors: ProviderError[] = [];

  for (const result of results) {
    if ("error" in result) {
      errors.push({ provider: result.provider, message: result.error ?? "Failed to load actions" });
      continue;
    }

    for (const action of result.manifest.actions) {
      if (!matchesPlacement(action, response.placement)) continue;
      actions.push({
        ...action,
        key: `${result.provider.pluginId}:${action.id}`,
        provider: result.provider,
        targetPluginId: action.pluginId ?? result.provider.pluginId,
      });
    }
  }

  return { actions, errors };
}

async function fetchManifest(provider: NormalizedActionProviderConfig): Promise<ActionsManifest> {
  const response = await apiFetch(providerPluginRoute(provider.pluginId, provider.manifestRoute));
  const manifest = await parseApiResponse<unknown>(
    response,
    `Failed to load ${provider.pluginId} actions`,
  );
  return parseActionsManifest(manifest, provider);
}

async function resolveFieldAction(
  options: ActionButtonFieldOptions | undefined,
  value: unknown,
  label: string | undefined,
): Promise<UiAction> {
  const provider = fieldProvider(options);
  const route = optionalFieldString(options?.route);

  if (route) {
    return fieldActionFromDescriptor(
      {
        confirm: optionalFieldString(options?.confirm),
        contextKey: optionalFieldString(options?.contextKey),
        contextValueKey: optionalFieldString(options?.contextValueKey),
        description: optionalFieldString(options?.description),
        disabled: options?.disabled,
        icon: optionalFieldString(options?.icon),
        id: optionalFieldString(options?.action) ?? `field.${provider.pluginId}.${route}`,
        label: optionalFieldString(options?.label) ?? label ?? "Run action",
        method: readFieldMethod(options?.method),
        payload: mergeFieldPayload(undefined, options, value),
        placement: optionalFieldString(options?.placement) ?? "field",
        pollIntervalMs: positiveFieldNumber(options?.pollIntervalMs),
        pollTimeoutMs: positiveFieldNumber(options?.pollTimeoutMs),
        route,
        tone: readFieldTone(options?.tone),
      },
      provider,
    );
  }

  const actionId = optionalFieldString(options?.action);
  if (!actionId) {
    throw new Error("Action button field requires either options.action or options.route");
  }

  const manifest = await fetchManifest(provider);
  const placement = optionalFieldString(options?.placement) ?? "field";
  const action = manifest.actions.find(
    (candidate) => candidate.id === actionId && matchesPlacement(candidate, placement),
  );

  if (!action) {
    throw new Error(`Action ${actionId} was not found for ${provider.pluginId}`);
  }

  return fieldActionFromDescriptor(
    {
      ...action,
      confirm: optionalFieldString(options?.confirm) ?? action.confirm,
      contextKey: optionalFieldString(options?.contextKey) ?? action.contextKey,
      contextValueKey: optionalFieldString(options?.contextValueKey) ?? action.contextValueKey,
      description: optionalFieldString(options?.description) ?? action.description,
      disabled: options?.disabled ?? action.disabled,
      label: optionalFieldString(options?.label) ?? action.label,
      payload: mergeFieldPayload(action.payload, options, value),
      pollIntervalMs: positiveFieldNumber(options?.pollIntervalMs) ?? action.pollIntervalMs,
      pollTimeoutMs: positiveFieldNumber(options?.pollTimeoutMs) ?? action.pollTimeoutMs,
    },
    provider,
  );
}

function fieldProvider(
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

function fieldActionFromDescriptor(
  action: ActionDescriptor,
  provider: NormalizedActionProviderConfig,
): UiAction {
  return {
    ...action,
    key: `field:${provider.pluginId}:${action.id}`,
    provider,
    targetPluginId: action.pluginId ?? provider.pluginId,
  };
}

function mergeFieldPayload(
  actionPayload: Record<string, unknown> | undefined,
  options: ActionButtonFieldOptions | undefined,
  value: unknown,
) {
  const payload = {
    ...actionPayload,
    ...asRecord(options?.payload),
  };
  const valueKey = optionalFieldString(options?.valueKey);
  if (valueKey) payload[valueKey] = value;
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function mergeActionContextPayload(
  payload: Record<string, unknown> | undefined,
  options: Pick<ActionDescriptor, "contextKey" | "contextValueKey">,
  context: ActionButtonContext | undefined,
) {
  const contextKey = optionalFieldString(options.contextKey);
  if (!contextKey) return payload;

  const contextValue = readActionContextValue(options, context);
  return {
    ...payload,
    [contextKey]: contextValue,
  };
}

function readActionContextValue(
  options: Pick<ActionDescriptor, "contextValueKey">,
  context: ActionButtonContext | undefined,
) {
  if (!context) {
    throw new Error("Action context is not available from this EmDash admin version.");
  }

  const contextValueKey = optionalFieldString(options.contextValueKey);
  if (!contextValueKey) return context;

  const value = readPath(context, contextValueKey);
  if (value === undefined) {
    throw new Error(`Action context value "${contextValueKey}" is missing.`);
  }
  return value;
}

async function contextForAction(
  action: Pick<ActionDescriptor, "contextKey">,
  providedContext: ActionButtonContext | undefined,
  resolveContext: () => Promise<ActionButtonContext>,
) {
  if (!optionalFieldString(action.contextKey)) return providedContext;
  return providedContext ?? resolveContext();
}

async function resolveFieldContext(
  providedContext: ActionButtonContext | undefined,
  input: FieldContextInput,
): Promise<ActionButtonContext> {
  if (providedContext) return providedContext;

  const route = readEntryContextRoute();
  const [entry, currentUser] = await Promise.all([
    route.collection && route.entryId
      ? fetchEntryContextItem(route.collection, route.entryId)
      : Promise.resolve(null),
    fetchCurrentUserContext(),
  ]);

  return compactContext({
    surface: "field",
    collection: route.collection,
    fieldName: fieldNameFromId(input.id),
    fieldLabel: input.label,
    fieldRequired: input.required,
    fieldValue: input.value,
    entryId: route.entryId ?? entry?.id,
    entrySlug: cleanOptionalString(entry?.slug),
    entryStatus: cleanOptionalString(entry?.status),
    entryLocale: route.entryLocale ?? cleanOptionalString(entry?.locale) ?? null,
    isNew: route.isNew,
    entryData: asRecord(entry?.data) ?? undefined,
    currentUser: currentUser ?? undefined,
  });
}

async function resolveDashboardContext(): Promise<ActionButtonContext> {
  const currentUser = await fetchCurrentUserContext();
  return compactContext({
    surface: "dashboard",
    currentUser: currentUser ?? undefined,
  });
}

function readEntryContextRoute(): EntryContextRoute {
  if (typeof window === "undefined") return {};

  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
  const contentIndex = segments.findIndex(
    (segment, index) => segment === "content" && segments[index - 1] === "admin",
  );
  const index = contentIndex >= 0 ? contentIndex : segments.indexOf("content");
  const collection = index >= 0 ? cleanOptionalString(segments[index + 1]) : undefined;
  const idOrNew = index >= 0 ? cleanOptionalString(segments[index + 2]) : undefined;
  const locale = cleanOptionalString(url.searchParams.get("locale"));

  if (!collection) return {};
  if (idOrNew === "new") {
    return {
      collection,
      entryLocale: locale ?? null,
      isNew: true,
    };
  }

  return {
    collection,
    entryId: idOrNew,
    entryLocale: locale,
    isNew: idOrNew ? false : undefined,
  };
}

async function fetchEntryContextItem(collection: string, entryId: string) {
  try {
    const result = await parseApiResponse<{ item?: EntryContextItem }>(
      await apiFetch(
        `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}`,
      ),
      "Failed to fetch entry context",
    );
    return result.item ?? null;
  } catch {
    return null;
  }
}

async function fetchCurrentUserContext() {
  try {
    const user = await parseApiResponse<unknown>(
      await apiFetch("/_emdash/api/auth/me"),
      "Failed to fetch current user",
    );
    const record = asRecord(user);
    const id = typeof record?.id === "string" ? record.id : undefined;
    if (!id) return null;
    return record as CurrentUserContext;
  } catch {
    return null;
  }
}

function fieldNameFromId(id: string | undefined) {
  const prefix = "field-";
  if (!id?.startsWith(prefix)) return undefined;
  return cleanOptionalString(id.slice(prefix.length));
}

function compactContext(context: ActionButtonContext): ActionButtonContext {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) compacted[key] = value;
  }
  return compacted as ActionButtonContext;
}

function cleanOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function applyFieldResultValue(
  result: ActionRunResult,
  options: ActionButtonFieldOptions | undefined,
  onChange: (value: unknown) => void,
) {
  const key = optionalFieldString(options?.resultValueKey);
  if (!key) return;

  const value = readPath(result, key);
  if (value !== undefined) onChange(value);
}

function clipboardText(
  options: ActionButtonFieldOptions | undefined,
  value: unknown,
  context: ActionButtonContext | undefined,
) {
  const literal = optionalFieldString(options?.clipboardText);
  if (literal !== undefined) return literal;

  const contextValueKey = optionalFieldString(options?.clipboardContextValueKey);
  if (contextValueKey) {
    return stringifyClipboardValue(readActionContextValue({ contextValueKey }, context));
  }

  const valueKey = optionalFieldString(options?.clipboardValueKey);
  const clipboardValue = valueKey ? readPath(value, valueKey) : value;
  if (clipboardValue === undefined) {
    throw new Error("Clipboard value is missing.");
  }
  return stringifyClipboardValue(clipboardValue);
}

async function writeClipboardText(text: string) {
  if (!globalThis.isSecureContext || !globalThis.navigator?.clipboard?.writeText) {
    throw new Error("Clipboard access requires HTTPS or localhost, plus browser permission.");
  }
  await globalThis.navigator.clipboard.writeText(text);
}

function stringifyClipboardValue(value: unknown) {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    throw new Error("Clipboard value could not be serialized.");
  }
}

function readPath(value: unknown, path: string) {
  let current = value;
  for (const segment of path.split(".")) {
    if (!segment) return undefined;
    const record = asRecord(current);
    if (!record || !Object.hasOwn(record, segment)) return undefined;
    current = record[segment];
  }
  return current;
}

function readFieldMode(value: unknown): ActionButtonMode {
  if (value === undefined || value === null) return "run";
  if (typeof value !== "string") throw new Error("Action field mode must be a string");
  const mode = value.trim();
  if (!ACTION_BUTTON_MODES.has(mode as ActionButtonMode)) {
    throw new Error(`Unsupported action field mode: ${value}`);
  }
  return mode as ActionButtonMode;
}

function readFieldMethod(value: unknown): ActionMethod | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action field method must be a string");
  const method = value.trim().toUpperCase();
  if (!ACTION_METHODS.has(method as ActionMethod)) {
    throw new Error(`Unsupported action field method: ${value}`);
  }
  return method as ActionMethod;
}

function readFieldTone(value: unknown): ActionTone | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Action field tone must be a string");
  const tone = value.trim();
  if (!ACTION_TONES.has(tone as ActionTone)) {
    throw new Error(`Unsupported action field tone: ${value}`);
  }
  return tone as ActionTone;
}

function readOptionalFieldTone(value: unknown): ActionTone | undefined {
  try {
    return readFieldTone(value);
  } catch {
    return undefined;
  }
}

function optionalFieldString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function positiveFieldNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function apiGet<T>(route: string): Promise<T> {
  const response = await apiFetch(pluginRoute(route));
  return parseApiResponse<T>(response, "Failed to load actions");
}

async function callAction<T>(
  action: UiAction,
  context: ActionButtonContext | undefined,
): Promise<T> {
  const method = action.method ?? "POST";
  const headers = new Headers();
  const init: RequestInit = { headers, method };

  if (hasJsonBody(method)) {
    const payload = mergeActionContextPayload(action.payload, action, context);
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(payload ?? {});
  }

  const response = await apiFetch(providerPluginRoute(action.targetPluginId, action.route), init);
  return parseApiResponse<T>(response, `Failed to run ${action.label}`);
}

async function pollActionStatus(action: UiAction, statusRoute: string): Promise<ActionRunResult> {
  const response = await apiFetch(providerPluginRoute(action.targetPluginId, statusRoute));
  return parseApiResponse<ActionRunResult>(response, `Failed to poll ${action.label}`);
}

async function waitForActionResult(
  action: UiAction,
  initialResult: ActionRunResult,
  onProgress: (result: ActionRunResult) => void,
): Promise<ActionRunResult> {
  let result = initialResult;
  let statusRoute = readStatusRoute(result);

  if (!shouldStartPolling(action, result, statusRoute)) return result;

  const timeoutMs = pollTimeoutMs(action);
  const startedAt = Date.now();
  let pollAtLeastOnce = action.resultMode === "emdash-action-accepted-v1";

  while (statusRoute && (pollAtLeastOnce || shouldContinuePolling(result))) {
    onProgress(result);
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`${action.label} is still running. Check the provider job status.`);
    }

    await sleep(pollDelayMs(action, result));
    result = await pollActionStatus(action, statusRoute);
    statusRoute = readStatusRoute(result) ?? statusRoute;
    pollAtLeastOnce = false;
  }

  return result;
}

function shouldStartPolling(
  action: ActionDescriptor,
  result: ActionRunResult,
  statusRoute: string | null,
) {
  if (!statusRoute) return false;
  if (shouldContinuePolling(result)) return true;
  return action.resultMode === "emdash-action-accepted-v1" && !isTerminalJobResult(result);
}

function shouldContinuePolling(result: ActionRunResult) {
  if (result.ok === false) return false;
  const jobStatus = readJobStatus(result);
  if (jobStatus) return PENDING_JOB_STATUSES.has(jobStatus);
  return result.status === 202;
}

function isTerminalJobResult(result: ActionRunResult) {
  const jobStatus = readJobStatus(result);
  if (jobStatus) {
    return jobStatus === "succeeded" || FAILED_JOB_STATUSES.has(jobStatus);
  }
  return result.ok === false || (typeof result.status === "number" && result.status !== 202);
}

function readStatusRoute(result: ActionRunResult) {
  if (!result.statusRoute) return null;
  return normalizePluginRoute(result.statusRoute);
}

function readJobStatus(result: ActionRunResult) {
  return typeof result.jobStatus === "string" ? result.jobStatus.trim().toLowerCase() : null;
}

function pollDelayMs(action: ActionDescriptor, result: ActionRunResult) {
  return clampPollMs(
    numberOrNull(result.pollAfterMs) ??
      numberOrNull(action.pollIntervalMs) ??
      DEFAULT_POLL_INTERVAL_MS,
  );
}

function pollTimeoutMs(action: ActionDescriptor) {
  return Math.min(
    MAX_POLL_TIMEOUT_MS,
    Math.max(MIN_POLL_INTERVAL_MS, numberOrNull(action.pollTimeoutMs) ?? DEFAULT_POLL_TIMEOUT_MS),
  );
}

function clampPollMs(value: number) {
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, value));
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function hasJsonBody(method: ActionMethod) {
  return method !== "DELETE";
}

function matchesPlacement(action: ActionDescriptor, placement: string | null) {
  return (
    !placement ||
    !action.placement ||
    action.placement === placement ||
    action.placement === "global"
  );
}

function buttonVariant(tone: ActionTone | undefined) {
  if (tone === "danger") return "destructive";
  return "secondary";
}

function actionIcon(action: ActionDescriptor) {
  return fieldIcon(action.icon);
}

function fieldButtonIcon(
  mode: ActionButtonMode,
  action: ActionDescriptor | null,
  options: ActionButtonFieldOptions | undefined,
) {
  const icon = optionalFieldString(options?.icon);
  if (icon) return fieldIcon(icon);
  if (action) return actionIcon(action);
  if (mode === "clipboard") return fieldIcon("clipboard");
  return <PlayIcon weight="bold" />;
}

function fieldIcon(icon: string | undefined) {
  if (icon === "copy" || icon === "clipboard") return <ClipboardTextIcon weight="bold" />;
  if (icon === "power") return <PowerIcon weight="bold" />;
  if (icon === "warning") return <WarningIcon weight="bold" />;
  if (icon === "check") return <CheckCircleIcon weight="bold" />;
  if (icon === "x" || icon === "close") return <XCircleIcon weight="bold" />;
  if (icon === "bolt" || icon === "lightning") return <LightningIcon weight="bold" />;
  return <PlayIcon weight="bold" />;
}

function fieldDefaultButtonLabel(mode: ActionButtonMode) {
  return mode === "clipboard" ? "Copy" : "Run action";
}

function noticeIcon(tone: NoticeTone) {
  if (tone === "warning") return <WarningIcon weight="fill" />;
  if (tone === "danger" || tone === "error") return <XCircleIcon weight="fill" />;
  if (tone === "positive" || tone === "success") return <CheckCircleIcon weight="fill" />;
  return <LightningIcon weight="fill" />;
}

function bannerVariant(tone: NoticeTone) {
  if (tone === "warning") return "alert";
  if (tone === "danger" || tone === "error") return "error";
  if (tone === "default" || tone === "info") return "default";
  return "secondary";
}

function noticeFromResult(
  action: ActionDescriptor,
  result: ActionRunResult,
  fallbackMessage = `${action.label} is running.`,
): Notice {
  return {
    tone: resultTone(result),
    message: resultMessage(result, fallbackMessage),
  };
}

function resultTone(result: ActionRunResult): NoticeTone {
  const jobStatus = readJobStatus(result);
  if (jobStatus && FAILED_JOB_STATUSES.has(jobStatus)) return "error";
  if (jobStatus && PENDING_JOB_STATUSES.has(jobStatus)) return "info";
  if (result.ok === false) return "error";
  return result.notification?.type ?? result.severity ?? "success";
}

function resultMessage(result: ActionRunResult, fallbackMessage: string) {
  const base = result.notification?.message ?? result.message ?? fallbackMessage;
  const progress = progressLabel(result.progress);
  const jobStatus = readJobStatus(result) as ActionJobStatus | null;
  const prefix = jobStatus ? jobStatusLabel(jobStatus) : null;
  const message =
    prefix && !base.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix}: ${base}` : base;

  return progress ? `${message} (${progress})` : message;
}

function jobStatusLabel(status: ActionJobStatus | string) {
  if (status === "accepted") return "Accepted";
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "succeeded") return "Finished";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

function progressLabel(progress: unknown) {
  const value = numberOrNull(progress);
  if (value === null) return null;
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`;
}

function parseActionsManifest(
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
    description: readOptionalString(record.description, "description"),
    disabled: readOptionalBoolean(record.disabled, "disabled"),
    icon: readOptionalString(record.icon, "icon"),
    method: readMethod(record.method),
    payload,
    placement: readOptionalString(record.placement, "placement"),
    pollIntervalMs: readOptionalNumber(record.pollIntervalMs, "pollIntervalMs"),
    pollTimeoutMs: readOptionalNumber(record.pollTimeoutMs, "pollTimeoutMs"),
    pluginId: targetPluginId,
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

function readRequiredString(value: unknown, field: string) {
  const text = readOptionalString(value, field);
  if (!text) throw new Error(`Action ${field} is required`);
  return text;
}

function readOptionalString(value: unknown, field: string) {
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

function readOptionalBoolean(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`Action ${field} must be a boolean`);
  return value;
}

function readOptionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Action ${field} must be a positive number`);
  }
  return value;
}

function readPayload(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (!record) throw new Error("Action payload must be an object");
  return record;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

export const widgets = {
  [WIDGET_ID]: ActionsWidget,
};

export const fields = {
  button: ActionButtonField,
};

export { ActionsWidget, PLUGIN_ID, WIDGET_ID };
