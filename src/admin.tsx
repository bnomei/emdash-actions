import {
  Badge,
  Banner,
  Button,
  Empty,
  LayerCard,
  Loader,
  Text,
  Toasty,
  createKumoToastManager,
} from "@cloudflare/kumo";
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
import { useEffect, useRef, useState } from "react";
import {
  contextForAction,
  mergeActionContextPayload,
  readActionContextValue,
  resolveDashboardContext,
  resolveFieldContext,
} from "./admin-context";
import {
  actionPatchChangesLabel,
  actionPatchFromResult,
  feedbackCooldownMs,
  mergeActionPatch,
  mergeActionResultPatch,
  normalizeActionRunResult,
  runActionEffects,
  writeClipboardText,
} from "./admin-effects";
import {
  asRecord,
  cleanOptionalString,
  errorMessage,
  hasJsonBody,
  numberOrNull,
  optionalFieldString,
  parseActionsManifest,
  positiveFieldNumber,
  providerFromFieldOptions,
  readFieldMethod,
  readFieldMode,
  readFieldTone,
  readOptionalButtonStyle,
  readOptionalFeedback,
  readOptionalFieldTone,
  readOptionalResultEffect,
  readPath,
} from "./admin-manifest";
import {
  isErrorResult,
  isSuccessfulTerminalResult,
  readJobStatus,
  resultPhase,
  resultToneStatus,
  waitForActionResult,
} from "./admin-polling";
import {
  actionBusyKey,
  addBusyKey,
  isActionBusy,
  isActionDisabled,
  removeBusyKey,
} from "./busy-state";
import type { CSSProperties, ReactNode } from "react";
import { PLUGIN_ID, WIDGET_ID, pluginRoute, providerPluginRoute } from "./shared";
import { isAbortError, throwIfAborted } from "./admin-cancellation";
import type {
  ActionButtonMode,
  ActionButtonStyle,
  ActionButtonContext,
  ActionButtonFieldOptions,
  ActionDescriptor,
  ActionJobStatus,
  ActionProviderConfig,
  ActionRunResult,
  ActionToast,
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

type NoticeTone = ActionTone | "error" | "success";

type ButtonFeedback = {
  phase: "progress" | "success" | "error";
  tone: NoticeTone;
  message: string;
  style?: ActionButtonStyle;
  className?: string;
} | null;

type FeedbackTimer = ReturnType<typeof globalThis.setTimeout>;

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

const actionToastManager = createKumoToastManager();

type DestructiveActionConfirm = (message: string) => boolean;

export function confirmDestructiveAction(
  message: string | undefined,
  confirm: DestructiveActionConfirm = globalThis.confirm.bind(globalThis),
) {
  return message ? confirm(message) : true;
}

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

function ActionRuntimeShell({ children }: { children: ReactNode }) {
  return <Toasty toastManager={actionToastManager}>{children}</Toasty>;
}

function ActionsWidget(props: DashboardWidgetProps = {}) {
  return (
    <ActionRuntimeShell>
      <ActionsWidgetContent {...props} />
    </ActionRuntimeShell>
  );
}

function ActionsWidgetContent({ context }: DashboardWidgetProps = {}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const busyKeysRef = useRef<ReadonlySet<string>>(new Set());
  const [feedbackByKey, setFeedbackByKey] = useState<Record<string, ButtonFeedback>>({});
  const feedbackTimers = useRef<Record<string, FeedbackTimer>>({});
  const runAbortControllers = useRef<Record<string, AbortController>>({});

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      try {
        const providers = await apiGet<ActionsProvidersResponse>("providers", controller.signal);
        const result = await loadProviderActions(providers, controller.signal);
        if (!active) return;
        setState({ status: "ready", ...result });
      } catch (error) {
        if (!active || isAbortError(error)) return;
        setState({ status: "error", message: errorMessage(error) });
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of Object.values(feedbackTimers.current)) {
        globalThis.clearTimeout(timer);
      }
      feedbackTimers.current = {};
      for (const controller of Object.values(runAbortControllers.current)) {
        controller.abort();
      }
      runAbortControllers.current = {};
    };
  }, []);

  function clearActionFeedback(actionKey: string) {
    const timer = feedbackTimers.current[actionKey];
    if (timer) {
      globalThis.clearTimeout(timer);
      delete feedbackTimers.current[actionKey];
    }

    setFeedbackByKey((current) => {
      if (!(actionKey in current)) return current;
      const next = { ...current };
      delete next[actionKey];
      return next;
    });
  }

  function setActionFeedback(action: UiAction, feedback: ButtonFeedback, reset = false) {
    clearActionFeedback(action.key);
    if (!feedback) return;

    setFeedbackByKey((current) => ({ ...current, [action.key]: feedback }));

    if (reset) {
      feedbackTimers.current[action.key] = globalThis.setTimeout(() => {
        clearActionFeedback(action.key);
      }, feedbackCooldownMs(action));
    }
  }

  function applyActionUpdate(action: UiAction, result: ActionRunResult) {
    const patch = actionPatchFromResult(result);
    if (!patch) return false;

    setState((current) => {
      if (current.status !== "ready") return current;
      return {
        ...current,
        actions: current.actions.map((candidate) =>
          candidate.key === action.key ? mergeActionPatch(candidate, patch) : candidate,
        ),
      };
    });
    return true;
  }

  async function runAction(action: UiAction) {
    if (action.confirm && !confirmDestructiveAction(action.confirm)) return;

    if (isActionBusy(busyKeysRef.current, action.key)) return;

    runAbortControllers.current[action.key]?.abort();
    const controller = new AbortController();
    runAbortControllers.current[action.key] = controller;
    busyKeysRef.current = addBusyKey(busyKeysRef.current, action.key);
    setBusyKeys(busyKeysRef.current);
    setActionFeedback(action, progressFeedbackForAction(action));
    try {
      const actionContext = await contextForAction(
        action,
        context,
        resolveDashboardContext,
        controller.signal,
      );
      throwIfAborted(controller.signal);
      const result = normalizeActionRunResult(
        action,
        await callAction(action, actionContext, controller.signal),
      );
      const finalResult = await waitForActionResult(
        action,
        result,
        (progress) => {
          setActionFeedback(action, feedbackFromResult(action, progress));
        },
        pollActionStatus,
        controller.signal,
      );
      showActionToasts(finalResult);
      if (isSuccessfulTerminalResult(finalResult)) {
        const updated = applyActionUpdate(action, finalResult);
        await runActionEffects(action, finalResult);
        if (updated && actionPatchChangesLabel(finalResult)) {
          clearActionFeedback(action.key);
        } else {
          setActionFeedback(
            action,
            feedbackFromResult(action, finalResult, `${action.label} finished.`),
            true,
          );
        }
      } else {
        setActionFeedback(
          action,
          feedbackFromResult(
            action,
            finalResult,
            isErrorResult(finalResult) ? `${action.label} failed.` : `${action.label} is running.`,
          ),
          true,
        );
      }
    } catch (error) {
      if (!isAbortError(error)) {
        setActionFeedback(
          action,
          { phase: "error", tone: "error", message: errorMessage(error) },
          true,
        );
      }
    } finally {
      if (runAbortControllers.current[action.key] === controller) {
        delete runAbortControllers.current[action.key];
      }
      busyKeysRef.current = removeBusyKey(busyKeysRef.current, action.key);
      setBusyKeys(busyKeysRef.current);
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
      {state.actions.length > 0 ? (
        <div style={actionListStyle}>
          {state.actions.map((action) => {
            const feedback = feedbackByKey[action.key] ?? null;
            const isBusy = isActionBusy(busyKeys, action.key);

            return (
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
                      className={buttonClassName(feedback)}
                      disabled={isActionDisabled(busyKeys, action.key, action.disabled === true)}
                      icon={buttonFeedbackIcon(action, feedback)}
                      loading={isBusy}
                      onClick={() => void runAction(action)}
                      style={buttonStyle(action, feedback)}
                      title={feedback?.message}
                      type="button"
                      variant={buttonVariant(feedback?.tone ?? action.tone, feedback)}
                    >
                      {feedback?.message ?? action.label}
                    </Button>
                  </div>
                </LayerCard.Primary>
              </LayerCard>
            );
          })}
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

export function ActionButtonField(props: FieldWidgetProps<ActionButtonFieldOptions>) {
  return (
    <ActionRuntimeShell>
      <ActionButtonFieldContent {...props} />
    </ActionRuntimeShell>
  );
}

function ActionButtonFieldContent({
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
  const [feedback, setFeedback] = useState<ButtonFeedback>(null);
  const feedbackTimer = useRef<FeedbackTimer | null>(null);
  const runAbortController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
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

        const resolved = await resolveFieldAction(options, value, label, controller.signal);
        if (!active) return;
        setAction(resolved);
        setError(null);
      } catch (loadError) {
        if (!active || isAbortError(loadError)) return;
        setMode("run");
        setAction(null);
        setError(errorMessage(loadError));
      }
    }

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [label, options, value]);

  useEffect(() => {
    return () => {
      if (feedbackTimer.current) {
        globalThis.clearTimeout(feedbackTimer.current);
        feedbackTimer.current = null;
      }
      runAbortController.current?.abort();
      runAbortController.current = null;
    };
  }, []);

  function clearFieldFeedback() {
    if (feedbackTimer.current) {
      globalThis.clearTimeout(feedbackTimer.current);
      feedbackTimer.current = null;
    }
    setFeedback(null);
  }

  function setFieldFeedback(
    nextFeedback: ButtonFeedback,
    reset = false,
    cooldownSource:
      | Pick<ActionDescriptor, "cooldownMs">
      | Pick<ActionButtonFieldOptions, "cooldownMs">
      | null = action,
  ) {
    clearFieldFeedback();
    if (!nextFeedback) return;

    setFeedback(nextFeedback);

    if (reset) {
      feedbackTimer.current = globalThis.setTimeout(
        () => {
          clearFieldFeedback();
        },
        feedbackCooldownMs(cooldownSource ?? undefined),
      );
    }
  }

  async function runFieldAction() {
    if (mode === "clipboard") {
      await copyFieldClipboardValue();
      return;
    }

    if (!action) return;
    if (action.confirm && !confirmDestructiveAction(action.confirm)) return;

    runAbortController.current?.abort();
    const controller = new AbortController();
    runAbortController.current = controller;

    setBusy(true);
    setFieldFeedback(progressFeedbackForAction(action), false, action);
    setError(null);
    try {
      const actionContext = await contextForAction(
        action,
        context,
        () => resolveFieldContext(context, { id, label, required, value }, controller.signal),
        controller.signal,
      );
      throwIfAborted(controller.signal);
      const result = normalizeActionRunResult(
        action,
        await callAction(action, actionContext, controller.signal),
      );
      const finalResult = await waitForActionResult(
        action,
        result,
        (progress) => {
          setFieldFeedback(feedbackFromResult(action, progress), false, action);
        },
        pollActionStatus,
        controller.signal,
      );
      showActionToasts(finalResult);
      if (isSuccessfulTerminalResult(finalResult)) {
        const patchedAction = mergeActionResultPatch(action, finalResult);
        if (patchedAction) setAction(patchedAction);
        await runActionEffects(action, finalResult);
        applyFieldResultValue(finalResult, options, onChange);
        if (patchedAction && actionPatchChangesLabel(finalResult)) {
          clearFieldFeedback();
        } else {
          setFieldFeedback(
            feedbackFromResult(action, finalResult, `${action.label} finished.`),
            true,
            action,
          );
        }
      } else {
        setFieldFeedback(
          feedbackFromResult(
            action,
            finalResult,
            isErrorResult(finalResult) ? `${action.label} failed.` : `${action.label} is running.`,
          ),
          true,
          action,
        );
      }
    } catch (runError) {
      if (!isAbortError(runError)) {
        setFieldFeedback(
          { phase: "error", tone: "error", message: errorMessage(runError) },
          true,
          action,
        );
      }
    } finally {
      if (runAbortController.current === controller) {
        runAbortController.current = null;
        setBusy(false);
      }
    }
  }

  async function copyFieldClipboardValue() {
    if (options?.confirm && !confirmDestructiveAction(options.confirm)) return;

    setBusy(true);
    clearFieldFeedback();
    setError(null);
    try {
      const clipboardContext = optionalFieldString(options?.clipboardContextValueKey)
        ? await resolveFieldContext(context, { id, label, required, value })
        : context;
      const text = clipboardText(options, value, clipboardContext);
      await writeClipboardText(text);
      setFieldFeedback(
        {
          phase: "success",
          tone: "success",
          message: optionalFieldString(options?.clipboardSuccess) ?? "Copied to clipboard.",
        },
        true,
        options ?? null,
      );
    } catch (copyError) {
      setFieldFeedback(
        { phase: "error", tone: "error", message: errorMessage(copyError) },
        true,
        options ?? null,
      );
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

      <Button
        className={buttonClassName(feedback)}
        disabled={disabled || action?.disabled === true}
        icon={fieldButtonFeedbackIcon(mode, action, options, feedback)}
        loading={busy}
        onClick={() => void runFieldAction()}
        style={buttonStyle(action, feedback, options)}
        title={feedback?.message}
        type="button"
        variant={buttonVariant(
          feedback?.tone ?? action?.tone ?? readOptionalFieldTone(options?.tone),
          feedback,
        )}
      >
        {feedback?.message ?? buttonLabel}
      </Button>
    </div>
  );
}

async function loadProviderActions(response: ActionsProvidersResponse, signal?: AbortSignal) {
  const results = await Promise.all(
    response.providers.map(async (provider) => {
      try {
        const manifest = await fetchManifest(provider, signal);
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
        key: actionBusyKey(result.provider.pluginId, action.id),
        provider: result.provider,
        targetPluginId: action.pluginId ?? result.provider.pluginId,
      });
    }
  }

  return { actions, errors };
}

async function fetchManifest(
  provider: NormalizedActionProviderConfig,
  signal?: AbortSignal,
): Promise<ActionsManifest> {
  const response = await apiFetch(providerPluginRoute(provider.pluginId, provider.manifestRoute), {
    signal,
  });
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
  signal?: AbortSignal,
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
        buttonStyle: readOptionalButtonStyle(options?.buttonStyle, "buttonStyle"),
        cooldownMs: positiveFieldNumber(options?.cooldownMs),
        feedback: readOptionalFeedback(options?.feedback, "feedback"),
        pollIntervalMs: positiveFieldNumber(options?.pollIntervalMs),
        pollTimeoutMs: positiveFieldNumber(options?.pollTimeoutMs),
        resultEffect: readOptionalResultEffect(options?.resultEffect, "resultEffect"),
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

  const manifest = await fetchManifest(provider, signal);
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
      buttonStyle:
        readOptionalButtonStyle(options?.buttonStyle, "buttonStyle") ?? action.buttonStyle,
      feedback: readOptionalFeedback(options?.feedback, "feedback") ?? action.feedback,
      label: optionalFieldString(options?.label) ?? action.label,
      payload: mergeFieldPayload(action.payload, options, value),
      cooldownMs: positiveFieldNumber(options?.cooldownMs) ?? action.cooldownMs,
      pollIntervalMs: positiveFieldNumber(options?.pollIntervalMs) ?? action.pollIntervalMs,
      pollTimeoutMs: positiveFieldNumber(options?.pollTimeoutMs) ?? action.pollTimeoutMs,
      resultEffect:
        readOptionalResultEffect(options?.resultEffect, "resultEffect") ?? action.resultEffect,
    },
    provider,
  );
}

function fieldProvider(
  options: ActionButtonFieldOptions | undefined,
): NormalizedActionProviderConfig {
  return providerFromFieldOptions(options);
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

async function apiGet<T>(route: string, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(pluginRoute(route), { signal });
  return parseApiResponse<T>(response, "Failed to load actions");
}

async function callAction(
  action: UiAction,
  context: ActionButtonContext | undefined,
  signal?: AbortSignal,
) {
  const method = action.method ?? "POST";
  const headers = new Headers();
  const init: RequestInit = { headers, method, signal };

  if (hasJsonBody(method)) {
    const payload = mergeActionContextPayload(action.payload, action, context);
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(payload ?? {});
  }

  const response = await apiFetch(providerPluginRoute(action.targetPluginId, action.route), init);
  return parseApiResponse<unknown>(response, `Failed to run ${action.label}`);
}

async function pollActionStatus(
  action: UiAction,
  statusRoute: string,
  signal?: AbortSignal,
): Promise<ActionRunResult> {
  const response = await apiFetch(providerPluginRoute(action.targetPluginId, statusRoute), {
    signal,
  });
  const result = await parseApiResponse<unknown>(response, `Failed to poll ${action.label}`);
  return normalizeActionRunResult(action, result);
}

function showActionToasts(result: ActionRunResult) {
  for (const toast of actionToasts(result)) {
    const title = cleanOptionalString(toast.title);
    const message = cleanOptionalString(toast.message);
    if (!title && !message) continue;

    actionToastManager.add({
      id: cleanOptionalString(toast.id),
      title: title ?? message ?? "Action finished",
      description: message && message !== title ? message : undefined,
      timeout: numberOrNull(toast.timeoutMs) ?? undefined,
      variant: toastVariant(toast.type),
    });
  }
}

function actionToasts(result: ActionRunResult): ActionToast[] {
  const toast = result.toast;
  const toasts: ActionToast[] = [];
  if (toast !== false) {
    if (Array.isArray(toast)) toasts.push(...toast.filter(isActionToast));
    else if (isActionToast(toast)) toasts.push(toast);
  }

  if (Array.isArray(result.notification)) {
    toasts.push(...result.notification.filter(isActionToast));
  }

  return toasts;
}

function isActionToast(value: unknown): value is ActionToast {
  return !!asRecord(value);
}

function toastVariant(type: ActionToast["type"]) {
  if (type === "positive" || type === "success") return "success";
  if (type === "danger" || type === "error") return "error";
  if (type === "warning") return "warning";
  if (type === "info") return "info";
  return "default";
}

function matchesPlacement(action: ActionDescriptor, placement: string | null) {
  return (
    !placement ||
    !action.placement ||
    action.placement === placement ||
    action.placement === "global"
  );
}

function buttonVariant(tone: NoticeTone | undefined, feedback?: ButtonFeedback) {
  if (feedback?.style?.resetStyle === true) return "secondary";
  if (feedback?.className || feedback?.style || (feedback && feedback.phase !== "progress")) {
    return "outline";
  }
  if (tone === "danger" || tone === "error") return "destructive";
  return "secondary";
}

function buttonStyle(
  action: Pick<ActionDescriptor, "buttonStyle"> | null,
  feedback: ButtonFeedback,
  options?: Pick<ActionButtonFieldOptions, "buttonStyle">,
) {
  const base =
    feedback?.phase === "progress" ? undefined : (options?.buttonStyle ?? action?.buttonStyle);
  const style = mergeButtonStyle(base, feedback?.style ?? defaultButtonFeedbackStyle(feedback));
  return style && Object.keys(style).length > 0 ? style : undefined;
}

function mergeButtonStyle(
  base: ActionButtonStyle | undefined,
  override: ActionButtonStyle | undefined,
) {
  const source = override?.resetStyle ? undefined : base;
  const style: CSSProperties & { "--tw-ring-color"?: string } = {};
  const sourceColor = themedStyleValue(source?.color, source?.darkColor);
  const sourceBackgroundColor = themedStyleValue(
    source?.backgroundColor,
    source?.darkBackgroundColor,
  );
  const sourceBorderColor = themedStyleValue(source?.borderColor, source?.darkBorderColor);
  const overrideColor = themedStyleValue(override?.color, override?.darkColor);
  const overrideBackgroundColor = themedStyleValue(
    override?.backgroundColor,
    override?.darkBackgroundColor,
  );
  const overrideBorderColor = themedStyleValue(override?.borderColor, override?.darkBorderColor);
  if (sourceColor) style.color = sourceColor;
  if (sourceBackgroundColor) style.backgroundColor = sourceBackgroundColor;
  if (sourceBorderColor) {
    style.borderColor = sourceBorderColor;
    style["--tw-ring-color"] = sourceBorderColor;
  }
  if (overrideColor) style.color = overrideColor;
  if (overrideBackgroundColor) style.backgroundColor = overrideBackgroundColor;
  if (overrideBorderColor) {
    style.borderColor = overrideBorderColor;
    style["--tw-ring-color"] = overrideBorderColor;
  }
  return style;
}

function themedStyleValue(light: string | undefined, dark: string | undefined) {
  if (!light) return undefined;
  return dark ? `light-dark(${light}, ${dark})` : light;
}

function mergeActionButtonStyle(
  base: ActionButtonStyle | undefined,
  override: ActionButtonStyle,
): ActionButtonStyle {
  return override.resetStyle ? override : { ...base, ...override };
}

function buttonClassName(feedback: ButtonFeedback) {
  return feedback?.className;
}

function defaultButtonFeedbackStyle(feedback: ButtonFeedback): ActionButtonStyle | undefined {
  if (!feedback || feedback.phase === "progress" || feedback.className) return undefined;

  const token = feedbackToneToken(feedback.tone);
  if (!token) return undefined;

  return {
    color: `var(--text-color-kumo-${token})`,
    backgroundColor: `var(--color-kumo-${token}-tint)`,
    borderColor: `var(--color-kumo-${token})`,
  };
}

function feedbackToneToken(tone: NoticeTone | undefined) {
  if (tone === "danger" || tone === "error") return "danger";
  if (tone === "positive" || tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "info") return "info";
  return null;
}

function actionIcon(action: ActionDescriptor) {
  return fieldIcon(action.icon);
}

function buttonFeedbackIcon(action: ActionDescriptor, feedback: ButtonFeedback) {
  return feedback ? feedbackIcon(feedback.tone) : actionIcon(action);
}

function fieldButtonFeedbackIcon(
  mode: ActionButtonMode,
  action: ActionDescriptor | null,
  options: ActionButtonFieldOptions | undefined,
  feedback: ButtonFeedback,
) {
  return feedback ? feedbackIcon(feedback.tone) : fieldButtonIcon(mode, action, options);
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

function feedbackIcon(tone: NoticeTone) {
  if (tone === "warning") return <WarningIcon weight="fill" />;
  if (tone === "danger" || tone === "error") return <XCircleIcon weight="fill" />;
  if (tone === "positive" || tone === "success") return <CheckCircleIcon weight="fill" />;
  return <LightningIcon weight="fill" />;
}

function feedbackFromResult(
  action: ActionDescriptor,
  result: ActionRunResult,
  fallbackMessage = `${action.label} is running.`,
): ButtonFeedback {
  const phase = resultPhase(result);
  return {
    phase,
    tone: resultTone(result),
    message: resultMessage(action, result, phase, fallbackMessage),
    style: resultFeedbackStyle(action, result, phase),
  };
}

function progressFeedbackForAction(action: ActionDescriptor): ButtonFeedback {
  return {
    phase: "progress",
    tone: "info",
    message: action.feedback?.progress ?? `${action.label} is running.`,
    style: action.feedback?.progressStyle,
  };
}

function resultTone(result: ActionRunResult): NoticeTone {
  const statusTone = resultToneStatus(result);
  if (statusTone) return statusTone;
  return inlineNotification(result)?.type ?? result.severity ?? "success";
}

function resultMessage(
  action: ActionDescriptor,
  result: ActionRunResult,
  phase: "progress" | "success" | "error",
  fallbackMessage: string,
) {
  const phaseMessage =
    phase === "progress"
      ? action.feedback?.progress
      : phase === "error"
        ? (cleanOptionalString(result.error) ?? action.feedback?.error)
        : (cleanOptionalString(result.success) ?? action.feedback?.success);

  const base =
    cleanOptionalString(result.message) ??
    cleanOptionalString(inlineNotification(result)?.message) ??
    phaseMessage ??
    cleanOptionalString(result.label) ??
    fallbackMessage;
  const progress = progressLabel(result.progress);
  const jobStatus = readJobStatus(result) as ActionJobStatus | null;
  const prefix = jobStatus ? jobStatusLabel(jobStatus) : null;
  const message =
    prefix && !base.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix}: ${base}` : base;

  return progress ? `${message} (${progress})` : message;
}

function inlineNotification(result: ActionRunResult) {
  return Array.isArray(result.notification) ? null : result.notification;
}

function resultFeedbackStyle(
  action: ActionDescriptor,
  result: ActionRunResult,
  phase: "progress" | "success" | "error",
) {
  const configured =
    phase === "progress"
      ? action.feedback?.progressStyle
      : phase === "error"
        ? action.feedback?.errorStyle
        : action.feedback?.successStyle;

  const override: ActionButtonStyle = {};
  const color = cleanOptionalString(result.color);
  const backgroundColor = cleanOptionalString(result.backgroundColor);
  const borderColor = cleanOptionalString(result.borderColor);
  const darkColor = cleanOptionalString(result.darkColor);
  const darkBackgroundColor = cleanOptionalString(result.darkBackgroundColor);
  const darkBorderColor = cleanOptionalString(result.darkBorderColor);
  if (color) override.color = color;
  if (backgroundColor) override.backgroundColor = backgroundColor;
  if (borderColor) override.borderColor = borderColor;
  if (darkColor) override.darkColor = darkColor;
  if (darkBackgroundColor) override.darkBackgroundColor = darkBackgroundColor;
  if (darkBorderColor) override.darkBorderColor = darkBorderColor;
  if (result.resetStyle === true) override.resetStyle = true;

  return Object.keys(override).length > 0
    ? mergeActionButtonStyle(configured, override)
    : configured;
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

export const widgets = {
  [WIDGET_ID]: ActionsWidget,
};

export const fields = {
  button: ActionButtonField,
};

export { ActionsWidget, PLUGIN_ID, WIDGET_ID };
