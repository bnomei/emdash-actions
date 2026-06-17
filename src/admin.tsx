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
import { actionBusyKey, addBusyKey, isActionBusy, isActionDisabled, removeBusyKey } from "./busy-state";
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
import { isAbortError, sleep, throwIfAborted } from "./admin-cancellation";
import type {
  ActionButtonMode,
  ActionButtonStyle,
  ActionButtonContext,
  ActionButtonFieldOptions,
  ActionDescriptor,
  ActionFeedbackOptions,
  ActionJobStatus,
  ActionMethod,
  ActionProviderConfig,
  ActionResultActionPatch,
  ActionResultEffectPreset,
  ActionResultEffects,
  ActionResultOpenTarget,
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

const ACTION_METHODS = new Set<ActionMethod>(["POST", "PUT", "PATCH", "DELETE"]);
const ACTION_BUTTON_MODES = new Set<ActionButtonMode>(["run", "clipboard"]);
const ACTION_TONES = new Set<ActionTone>(["default", "positive", "warning", "danger", "info"]);
const ACTION_RESULT_EFFECT_PRESETS = new Set(["clipboard", "copy", "open", "download"]);
const ACTION_RESULT_OPEN_TARGETS = new Set<ActionResultOpenTarget>(["self", "blank"]);
const PENDING_JOB_STATUSES = new Set<string>(["accepted", "queued", "running"]);
const FAILED_JOB_STATUSES = new Set<string>(["failed", "cancelled"]);
const MAX_ACTIONS_PER_PROVIDER = 50;
const MAX_STRING_LENGTH = 220;
const DEFAULT_POLL_INTERVAL_MS = 1500;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 30000;
const DEFAULT_POLL_TIMEOUT_MS = 120000;
const MAX_POLL_TIMEOUT_MS = 900000;
const DEFAULT_FEEDBACK_COOLDOWN_MS = 2000;
const MAX_FEEDBACK_COOLDOWN_MS = 60000;

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
  resolveContext: (signal?: AbortSignal) => Promise<ActionButtonContext>,
  signal?: AbortSignal,
) {
  if (!optionalFieldString(action.contextKey)) return providedContext;
  throwIfAborted(signal);
  return providedContext ?? resolveContext(signal);
}

async function resolveFieldContext(
  providedContext: ActionButtonContext | undefined,
  input: FieldContextInput,
  signal?: AbortSignal,
): Promise<ActionButtonContext> {
  if (providedContext) return providedContext;

  const route = readEntryContextRoute();
  const [entry, currentUser] = await Promise.all([
    route.collection && route.entryId
      ? fetchEntryContextItem(route.collection, route.entryId, signal)
      : Promise.resolve(null),
    fetchCurrentUserContext(signal),
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

async function resolveDashboardContext(signal?: AbortSignal): Promise<ActionButtonContext> {
  const currentUser = await fetchCurrentUserContext(signal);
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

async function fetchEntryContextItem(collection: string, entryId: string, signal?: AbortSignal) {
  try {
    const result = await parseApiResponse<{ item?: EntryContextItem }>(
      await apiFetch(
        `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}`,
        { signal },
      ),
      "Failed to fetch entry context",
    );
    return result.item ?? null;
  } catch {
    return null;
  }
}

async function fetchCurrentUserContext(signal?: AbortSignal) {
  try {
    const user = await parseApiResponse<unknown>(
      await apiFetch("/_emdash/api/auth/me", { signal }),
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

async function waitForActionResult(
  action: UiAction,
  initialResult: ActionRunResult,
  onProgress: (result: ActionRunResult) => void,
  signal?: AbortSignal,
): Promise<ActionRunResult> {
  let result = initialResult;
  let statusRoute = readStatusRoute(result);

  if (!shouldStartPolling(action, result, statusRoute)) return result;

  const timeoutMs = pollTimeoutMs(action);
  const startedAt = Date.now();
  let pollAtLeastOnce = action.resultMode === "emdash-action-accepted-v1";

  while (statusRoute && (pollAtLeastOnce || shouldContinuePolling(result))) {
    throwIfAborted(signal);
    onProgress(result);
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`${action.label} is still running. Check the provider job status.`);
    }

    await sleep(pollDelayMs(action, result), signal);
    result = await pollActionStatus(action, statusRoute, signal);
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

function feedbackCooldownMs(
  source:
    | Pick<ActionDescriptor, "cooldownMs">
    | Pick<ActionButtonFieldOptions, "cooldownMs">
    | undefined,
) {
  return clampFeedbackMs(numberOrNull(source?.cooldownMs) ?? DEFAULT_FEEDBACK_COOLDOWN_MS);
}

function clampPollMs(value: number) {
  return Math.min(MAX_POLL_INTERVAL_MS, Math.max(MIN_POLL_INTERVAL_MS, value));
}

function clampFeedbackMs(value: number) {
  return Math.min(MAX_FEEDBACK_COOLDOWN_MS, Math.max(0, value));
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasJsonBody(method: ActionMethod) {
  return method !== "DELETE";
}

function normalizeActionRunResult(action: ActionDescriptor, value: unknown): ActionRunResult {
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

function effectsFromResultEffect(
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

function actionPatchFromResult(result: ActionRunResult): ActionResultActionPatch | null {
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

function mergeActionResultPatch<TAction extends UiAction>(
  action: TAction,
  result: ActionRunResult,
): TAction | null {
  const patch = actionPatchFromResult(result);
  return patch ? mergeActionPatch(action, patch) : null;
}

function mergeActionPatch<TAction extends UiAction>(
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

function actionPatchChangesLabel(result: ActionRunResult) {
  return asRecord(result.action)?.label !== undefined;
}

function resultPhase(result: ActionRunResult): "progress" | "success" | "error" {
  if (isErrorResult(result)) return "error";
  if (shouldContinuePolling(result)) return "progress";
  return "success";
}

function isErrorResult(result: ActionRunResult) {
  const jobStatus = readJobStatus(result);
  if (jobStatus && FAILED_JOB_STATUSES.has(jobStatus)) return true;
  if (result.ok === false) return true;
  return typeof result.status === "number" && result.status >= 400;
}

function isSuccessfulTerminalResult(result: ActionRunResult) {
  if (isErrorResult(result)) return false;
  if (shouldContinuePolling(result)) return false;
  return result.status !== 202;
}

async function runActionEffects(action: UiAction, result: ActionRunResult) {
  const effects = actionResultEffects(result);
  if (!effects) return;

  const clipboard = clipboardEffectText(effects.clipboard);
  if (clipboard !== null) await writeClipboardText(clipboard);

  const download = asDownloadEffect(effects.download);
  if (download) await runDownloadEffect(action, download);

  const open = asOpenEffect(effects.open);
  if (open) runOpenEffect(open);

  const reload = asReloadEffect(effects.reload);
  if (reload) scheduleReload(action, reload.delayMs);
}

function actionResultEffects(result: ActionRunResult): ActionResultEffects | null {
  const effects = asRecord(result.effects) ? ({ ...result.effects } as ActionResultEffects) : {};
  if (result.reload !== undefined) effects.reload = result.reload;
  if (result.open !== undefined) effects.open = result.open;
  if (result.download !== undefined) effects.download = result.download;
  if (result.clipboard !== undefined) effects.clipboard = result.clipboard;
  return Object.keys(effects).length > 0 ? effects : null;
}

function clipboardEffectText(value: ActionResultEffects["clipboard"] | undefined) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  const text = asRecord(value)?.text;
  if (typeof text !== "string") throw new Error("Clipboard effect requires text.");
  return text;
}

function asOpenEffect(value: ActionResultEffects["open"] | undefined) {
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

function asDownloadEffect(value: ActionResultEffects["download"] | undefined) {
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

function asReloadEffect(value: ActionResultEffects["reload"] | undefined) {
  if (value === undefined || value === null || value === false) return null;
  if (value === true) return {};

  const record = asRecord(value);
  if (!record) throw new Error("Reload effect must be true or an object.");
  return {
    delayMs: readOptionalNumber(record.delayMs, "effects.reload.delayMs"),
  };
}

function runOpenEffect(effect: { url: string; target: ActionResultOpenTarget }) {
  const url = safeBrowserUrl(effect.url);
  if (effect.target === "self") {
    globalThis.location.assign(url.href);
    return;
  }
  globalThis.open(url.href, "_blank", "noopener,noreferrer");
}

async function runDownloadEffect(
  action: UiAction,
  effect: { filename?: string; route?: string; url?: string },
) {
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

function triggerDownload(url: string, filename: string | undefined) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename ?? "";
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function scheduleReload(action: ActionDescriptor, delayMs: number | undefined) {
  const delay = clampFeedbackMs(delayMs ?? feedbackCooldownMs(action));
  globalThis.setTimeout(() => {
    globalThis.location.reload();
  }, delay);
}

function safeBrowserUrl(value: string) {
  const base = typeof window === "undefined" ? "http://localhost" : window.location.href;
  const url = new URL(value, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Action URL must use http, https, or be relative.");
  }
  return url;
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
  const jobStatus = readJobStatus(result);
  if (jobStatus && FAILED_JOB_STATUSES.has(jobStatus)) return "error";
  if (jobStatus && PENDING_JOB_STATUSES.has(jobStatus)) return "info";
  if (result.ok === false) return "error";
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

function readNullableTone(value: unknown, field: string): ActionTone | null | undefined {
  if (value === null) return null;
  try {
    return readTone(value);
  } catch (error) {
    throw new Error(`${field}: ${errorMessage(error)}`);
  }
}

function readOpenTarget(value: unknown): ActionResultOpenTarget | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Open target must be a string");
  const target = value.trim();
  if (!ACTION_RESULT_OPEN_TARGETS.has(target as ActionResultOpenTarget)) {
    throw new Error(`Unsupported open target: ${value}`);
  }
  return target as ActionResultOpenTarget;
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

function readNullablePayload(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) return null;
  return readPayload(value);
}

function readNullableString(value: unknown, field: string) {
  if (value === null) return null;
  return readOptionalString(value, field);
}

function readOptionalButtonStyle(value: unknown, field: string): ActionButtonStyle | undefined {
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

function readOptionalFeedback(value: unknown, field: string): ActionFeedbackOptions | undefined {
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

function readOptionalResultEffect(
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
