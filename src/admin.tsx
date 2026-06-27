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
  ActivityIcon,
  ArrowCounterClockwiseIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockIcon,
  ClipboardTextIcon,
  DownloadSimpleIcon,
  EnvelopeIcon,
  KeyIcon,
  KeyholeIcon,
  LightningIcon,
  LockIcon,
  PlayIcon,
  PlusMinusIcon,
  PowerIcon,
  RepeatIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { apiFetch, parseApiResponse } from "emdash/plugin-utils";
import { useEffect, useRef, useState } from "react";
import { useAdminLocale } from "./admin-locale";
import {
  dashboardActionTarget,
  fieldActionTarget,
  contextForAction,
  readActionContextValue,
  resolveDashboardContext,
  resolveFieldContext,
} from "./admin-context";
import {
  actionFormInitialValues,
  actionFormPayload,
  actionMatchesTargetRequirement,
  actionRequestInit,
  actionRequestRoute,
  actionSubmitValidationError,
} from "./admin-invocation";
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
  numberOrNull,
  optionalFieldLocalizedString,
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
import {
  actionMessage,
  formatActionMessage,
  localizedString,
  type ActionsI18nConfig,
} from "./i18n";
import type {
  ActionButtonMode,
  ActionButtonStyle,
  ActionButtonContext,
  ActionButtonFieldOptions,
  ActionFormField,
  ActionJobStatus,
  ActionManifestDescriptor,
  ActionProviderConfig,
  ActionRunResult,
  ActionTarget,
  ActionToast,
  ActionsManifest,
  ActionsProvidersResponse,
  ActionTone,
  NormalizedActionProviderConfig,
} from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      actions: UiAction[];
      errors: ProviderError[];
      i18n?: ActionsI18nConfig;
    };

type UiAction = ActionManifestDescriptor & {
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
type ActionFormValues = Record<string, unknown>;

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

const inlineFormStyle = {
  display: "grid",
  gap: "0.5rem",
  minWidth: 0,
} satisfies CSSProperties;

const inlineFieldStyle = {
  display: "grid",
  gap: "0.25rem",
  minWidth: 0,
} satisfies CSSProperties;

const inlineInputStyle = {
  border: "1px solid var(--border-color-kumo-base, #d1d5db)",
  borderRadius: 6,
  font: "inherit",
  minHeight: 34,
  minWidth: 0,
  padding: "0.35rem 0.5rem",
  width: "100%",
} satisfies CSSProperties;

const inlineCheckboxStyle = {
  alignItems: "center",
  display: "flex",
  gap: "0.45rem",
  minWidth: 0,
} satisfies CSSProperties;

const buttonContentStyle = {
  alignItems: "center",
  display: "inline-flex",
  flexWrap: "wrap",
  gap: "0.45rem",
  minWidth: 0,
} satisfies CSSProperties;

const buttonLabelStyle = {
  overflowWrap: "anywhere",
  whiteSpace: "normal",
} satisfies CSSProperties;

const buttonLayoutStyle = {
  flexShrink: 1,
  height: "auto",
  maxWidth: "100%",
  minHeight: "2.25rem",
  minWidth: 0,
  whiteSpace: "normal",
} satisfies CSSProperties;

function contextI18n(context: ActionButtonContext | undefined): ActionsI18nConfig | undefined {
  const config = context?.i18n;
  if (!config) return undefined;
  return {
    defaultLocale: typeof config.defaultLocale === "string" ? config.defaultLocale : undefined,
    fallback: config.fallback,
    locale:
      typeof context.entryLocale === "string" && context.entryLocale
        ? context.entryLocale
        : typeof config.locale === "string"
          ? config.locale
          : undefined,
    locales: Array.isArray(config.locales)
      ? config.locales.filter((locale): locale is string => typeof locale === "string")
      : undefined,
  };
}

function mergeI18n(
  ...configs: Array<ActionsI18nConfig | undefined>
): ActionsI18nConfig | undefined {
  let merged: ActionsI18nConfig | undefined;
  for (const config of configs) {
    if (!config) continue;
    merged = {
      ...merged,
      ...config,
      fallback: { ...merged?.fallback, ...config.fallback },
      messages: { ...merged?.messages, ...config.messages },
    };
  }
  return merged;
}

function useActionI18n(i18n: ActionsI18nConfig | undefined): ActionsI18nConfig {
  const locale = useAdminLocale(i18n?.locale ?? i18n?.defaultLocale);
  return { ...i18n, locale };
}

function actionLabel(
  action: Pick<ActionManifestDescriptor, "id" | "label">,
  i18n: ActionsI18nConfig,
) {
  return localizedString(action.label, i18n, action.id);
}

function actionDescription(
  action: Pick<ActionManifestDescriptor, "description">,
  i18n: ActionsI18nConfig,
) {
  return localizedString(action.description, i18n);
}

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
  const [formValuesByKey, setFormValuesByKey] = useState<Record<string, ActionFormValues>>({});
  const feedbackTimers = useRef<Record<string, FeedbackTimer>>({});
  const runAbortControllers = useRef<Record<string, AbortController>>({});
  const responseI18n = state.status === "ready" ? state.i18n : undefined;
  const i18n = useActionI18n(mergeI18n(contextI18n(context), responseI18n));
  const targetType = dashboardActionTarget(context).type;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function load() {
      try {
        const providers = await apiGet<ActionsProvidersResponse>("providers", controller.signal);
        const result = await loadProviderActions(providers, controller.signal, targetType);
        if (!active) return;
        setState({ status: "ready", ...result, i18n: providers.i18n });
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
  }, [targetType]);

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

  function setDashboardFormValue(action: UiAction, fieldName: string, value: unknown) {
    setFormValuesByKey((current) => ({
      ...current,
      [action.key]: {
        ...dashboardFormValues(action, current[action.key]),
        [fieldName]: value,
      },
    }));
  }

  async function runAction(action: UiAction) {
    const label = actionLabel(action, i18n);
    const formValues = dashboardFormValues(action, formValuesByKey[action.key]);
    const target = dashboardActionTarget(context);
    const validationError = actionSubmitValidationError(action, target, formValues);
    if (validationError) {
      setActionFeedback(action, { phase: "error", tone: "error", message: validationError });
      return;
    }

    const confirmMessage = localizedString(action.confirm, i18n);
    if (confirmMessage && !confirmDestructiveAction(confirmMessage)) return;

    if (isActionBusy(busyKeysRef.current, action.key)) return;

    runAbortControllers.current[action.key]?.abort();
    const controller = new AbortController();
    runAbortControllers.current[action.key] = controller;
    busyKeysRef.current = addBusyKey(busyKeysRef.current, action.key);
    setBusyKeys(busyKeysRef.current);
    setActionFeedback(action, progressFeedbackForAction(action, i18n));
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
        await callAction(
          action,
          actionContext,
          dashboardActionTarget(actionContext),
          controller.signal,
          i18n,
          actionFormPayload(action.form, formValues),
        ),
      );
      const finalResult = await waitForActionResult(
        action,
        result,
        (progress) => {
          setActionFeedback(action, feedbackFromResult(action, progress, i18n));
        },
        (nextAction, statusRoute, signal) =>
          pollActionStatus(nextAction, statusRoute, signal, i18n),
        controller.signal,
      );
      showActionToasts(finalResult, i18n);
      if (isSuccessfulTerminalResult(finalResult)) {
        const updated = applyActionUpdate(action, finalResult);
        await runActionEffects(action, finalResult);
        if (updated && actionPatchChangesLabel(finalResult)) {
          clearActionFeedback(action.key);
        } else {
          setActionFeedback(
            action,
            feedbackFromResult(
              action,
              finalResult,
              i18n,
              formatActionMessage("actionFinished", i18n, { action: label }),
            ),
            true,
          );
        }
      } else {
        setActionFeedback(
          action,
          feedbackFromResult(
            action,
            finalResult,
            i18n,
            isErrorResult(finalResult)
              ? formatActionMessage("actionFailed", i18n, { action: label })
              : formatActionMessage("actionRunning", i18n, { action: label }),
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
            {actionMessage("loadingActions", i18n)}
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
            const formValues = dashboardFormValues(action, formValuesByKey[action.key]);
            const actionDisplayLabel = actionLabel(action, i18n);
            const buttonLabel =
              feedback?.message ??
              (localizedString(action.form?.submitLabel, i18n) || actionDisplayLabel);

            return (
              <LayerCard key={action.key}>
                <LayerCard.Primary>
                  <div style={actionRowContentStyle}>
                    <div style={actionHeaderStyle}>
                      <div style={actionTextStyle}>
                        <Text size="sm">{actionDisplayLabel}</Text>
                        {actionDescription(action, i18n) ? (
                          <Text size="xs" variant="secondary">
                            {actionDescription(action, i18n)}
                          </Text>
                        ) : null}
                      </div>
                      <Badge variant="secondary">
                        {localizedString(action.provider.label, i18n, action.provider.pluginId)}
                      </Badge>
                    </div>
                    <ActionInlineForm
                      action={action}
                      disabled={isBusy}
                      i18n={i18n}
                      onChange={(fieldName, fieldValue) =>
                        setDashboardFormValue(action, fieldName, fieldValue)
                      }
                      values={formValues}
                    />
                    <Button
                      className={buttonClassName(feedback)}
                      disabled={isActionDisabled(busyKeys, action.key, action.disabled === true)}
                      loading={isBusy}
                      onClick={() => void runAction(action)}
                      style={buttonInlineStyle(buttonStyle(action, feedback))}
                      aria-label={buttonLabel}
                      title={buttonLabel}
                      type="button"
                      variant={buttonVariant(feedback?.tone ?? action.tone, feedback)}
                    >
                      <ActionButtonContent
                        icon={buttonFeedbackIcon(action, feedback)}
                        label={buttonLabel}
                      />
                    </Button>
                  </div>
                </LayerCard.Primary>
              </LayerCard>
            );
          })}
        </div>
      ) : (
        <Empty
          description={actionMessage("noActionsConfiguredDescription", i18n)}
          icon={<LightningIcon size={32} />}
          size="sm"
          title={actionMessage("noActionsConfiguredTitle", i18n)}
        />
      )}

      {state.errors.length > 0 ? (
        <div style={footerStyle}>
          {state.errors.map((error) => (
            <Text key={error.provider.pluginId} size="xs" variant="error">
              {localizedString(error.provider.label, i18n, error.provider.pluginId)}:{" "}
              {error.message}
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

function ActionInlineForm({
  action,
  disabled,
  i18n,
  onChange,
  values,
}: {
  action: Pick<ActionManifestDescriptor, "form" | "payload"> | null;
  disabled?: boolean;
  i18n: ActionsI18nConfig;
  onChange: (fieldName: string, value: unknown) => void;
  values: ActionFormValues;
}) {
  const form = action?.form;
  if (!form || form.mode !== "inline" || form.fields.length === 0) return null;

  return (
    <div style={inlineFormStyle}>
      {form.fields.map((field) => (
        <ActionInlineFormField
          disabled={disabled}
          field={field}
          i18n={i18n}
          key={field.name}
          onChange={(value) => onChange(field.name, value)}
          value={values[field.name]}
        />
      ))}
    </div>
  );
}

function ActionInlineFormField({
  disabled,
  field,
  i18n,
  onChange,
  value,
}: {
  disabled?: boolean;
  field: ActionFormField;
  i18n: ActionsI18nConfig;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const label = localizedString(field.label, i18n, field.name);
  const description = localizedString(field.description, i18n);
  const type = field.type ?? "string";

  if (type === "boolean") {
    return (
      <label style={inlineCheckboxStyle}>
        <input
          checked={value === true}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>
          <Text size="xs">{label}</Text>
          {description ? (
            <Text size="xs" variant="secondary">
              {description}
            </Text>
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <label style={inlineFieldStyle}>
      <Text size="xs">{label}</Text>
      {type === "select" ? (
        <select
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          style={inlineInputStyle}
          value={stringFormValue(value)}
        >
          <option value="" />
          {(field.options ?? []).map((option) => (
            <option key={String(formOptionValue(option))} value={String(formOptionValue(option))}>
              {localizedString(formOptionLabel(option), i18n, String(formOptionValue(option)))}
            </option>
          ))}
        </select>
      ) : (
        <input
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          step={type === "integer" ? 1 : undefined}
          style={inlineInputStyle}
          type={inputTypeForFormField(type)}
          value={stringFormValue(value)}
        />
      )}
      {description ? (
        <Text size="xs" variant="secondary">
          {description}
        </Text>
      ) : null}
    </label>
  );
}

function dashboardFormValues(action: UiAction, values: ActionFormValues | undefined) {
  return values ?? actionFormInitialValues(action.form, action.payload);
}

function stringFormValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function formOptionValue(option: NonNullable<ActionFormField["options"]>[number]) {
  return typeof option === "object" && option !== null ? option.value : option;
}

function formOptionLabel(option: NonNullable<ActionFormField["options"]>[number]) {
  return typeof option === "object" && option !== null ? option.label : undefined;
}

function inputTypeForFormField(type: ActionFormField["type"]) {
  if (type === "number" || type === "integer") return "number";
  if (type === "datetime") return "datetime-local";
  return "text";
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
  const [formValues, setFormValues] = useState<ActionFormValues>({});
  const feedbackTimer = useRef<FeedbackTimer | null>(null);
  const runAbortController = useRef<AbortController | null>(null);
  const i18n = useActionI18n(mergeI18n(contextI18n(context), options?.i18n));
  const targetType = fieldActionTarget(context, { id, label, required, value }).type;

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

        const resolved = await resolveFieldAction(
          options,
          value,
          label,
          targetType,
          controller.signal,
          i18n,
        );
        if (!active) return;
        setAction(resolved);
        setFormValues(actionFormInitialValues(resolved.form, resolved.payload));
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
    // `value` is intentionally excluded: re-resolving on every host-field
    // keystroke would reset inline `setFormValues` and discard user input.
    // The live `value` is re-merged into the payload at submit time in
    // `runFieldAction`, so the resolved descriptor does not need to track it.
  }, [label, options, targetType]);

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

  // Abort any in-flight run when the bound field value, options, label, or
  // target change. This supersedes the run so its completion handler bails
  // (via `throwIfAborted`) instead of writing stale results back into the
  // now-changed field. It deliberately does not touch `formValues`, so inline
  // form input is preserved across host-field edits.
  useEffect(() => {
    return () => {
      runAbortController.current?.abort();
    };
  }, [label, options, targetType, value]);

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
      | Pick<ActionManifestDescriptor, "cooldownMs">
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
    const target = fieldActionTarget(context, { id, label, required, value });
    const validationError = actionSubmitValidationError(action, target, formValues);
    if (validationError) {
      setError(validationError);
      return;
    }

    const actionDisplayLabel = actionLabel(action, i18n);
    const confirmMessage = localizedString(action.confirm, i18n);
    if (confirmMessage && !confirmDestructiveAction(confirmMessage)) return;

    runAbortController.current?.abort();
    const controller = new AbortController();
    runAbortController.current = controller;

    setBusy(true);
    setFieldFeedback(progressFeedbackForAction(action, i18n), false, action);
    setError(null);
    try {
      const actionContext = await contextForAction(
        action,
        context,
        () => resolveFieldContext(context, { id, label, required, value }, controller.signal),
        controller.signal,
      );
      throwIfAborted(controller.signal);
      // Re-merge the live field value so a stale `valueKey` payload (resolved
      // before the user edited the field) cannot be submitted while the
      // descriptor reload is still in flight.
      const liveAction: UiAction = {
        ...action,
        payload: mergeFieldPayload(action.payload, options, value),
      };
      const result = normalizeActionRunResult(
        liveAction,
        await callAction(
          liveAction,
          actionContext,
          fieldActionTarget(actionContext, { id, label, required, value }),
          controller.signal,
          i18n,
          actionFormPayload(liveAction.form, formValues),
        ),
      );
      const finalResult = await waitForActionResult(
        action,
        result,
        (progress) => {
          setFieldFeedback(feedbackFromResult(action, progress, i18n), false, action);
        },
        (nextAction, statusRoute, signal) =>
          pollActionStatus(nextAction, statusRoute, signal, i18n),
        controller.signal,
      );
      // Bail before committing any state if the field value, options, or
      // resolved action changed while this run was in flight; otherwise a
      // stale completion could patch the descriptor, write the result back
      // through `onChange`, or run effects against superseded context.
      throwIfAborted(controller.signal);
      showActionToasts(finalResult, i18n);
      if (isSuccessfulTerminalResult(finalResult)) {
        const patchedAction = mergeActionResultPatch(action, finalResult);
        if (patchedAction) setAction(patchedAction);
        await runActionEffects(action, finalResult);
        applyFieldResultValue(finalResult, options, onChange);
        if (patchedAction && actionPatchChangesLabel(finalResult)) {
          clearFieldFeedback();
        } else {
          setFieldFeedback(
            feedbackFromResult(
              action,
              finalResult,
              i18n,
              formatActionMessage("actionFinished", i18n, { action: actionDisplayLabel }),
            ),
            true,
            action,
          );
        }
      } else {
        setFieldFeedback(
          feedbackFromResult(
            action,
            finalResult,
            i18n,
            isErrorResult(finalResult)
              ? formatActionMessage("actionFailed", i18n, { action: actionDisplayLabel })
              : formatActionMessage("actionRunning", i18n, { action: actionDisplayLabel }),
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
    const confirmMessage = localizedString(options?.confirm, i18n);
    if (confirmMessage && !confirmDestructiveAction(confirmMessage)) return;

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
          message:
            localizedString(optionalFieldLocalizedString(options?.clipboardSuccess), i18n) ||
            actionMessage("copiedToClipboard", i18n),
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

  const buttonLabel =
    localizedString(options?.label, i18n) ||
    (action ? actionLabel(action, i18n) : "") ||
    label ||
    fieldDefaultButtonLabel(mode, i18n);
  const buttonText =
    feedback?.message ?? (localizedString(action?.form?.submitLabel, i18n) || buttonLabel);
  const description =
    localizedString(options?.description, i18n) || (action ? actionDescription(action, i18n) : "");
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

      <ActionInlineForm
        action={action}
        disabled={busy}
        i18n={i18n}
        onChange={(fieldName, fieldValue) =>
          setFormValues((current) => ({ ...current, [fieldName]: fieldValue }))
        }
        values={formValues}
      />

      <Button
        className={buttonClassName(feedback)}
        disabled={disabled || action?.disabled === true}
        loading={busy}
        onClick={() => void runFieldAction()}
        style={buttonInlineStyle(buttonStyle(action, feedback, options))}
        aria-label={buttonText}
        title={buttonText}
        type="button"
        variant={buttonVariant(
          feedback?.tone ?? action?.tone ?? readOptionalFieldTone(options?.tone),
          feedback,
        )}
      >
        <ActionButtonContent
          icon={fieldButtonFeedbackIcon(mode, action, options, feedback)}
          label={buttonText}
        />
      </Button>
    </div>
  );
}

function ActionButtonContent({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span style={buttonContentStyle}>
      {icon}
      <span style={buttonLabelStyle}>{label}</span>
    </span>
  );
}

async function loadProviderActions(
  response: ActionsProvidersResponse,
  signal?: AbortSignal,
  targetType: ActionTarget["type"] = "dashboard",
) {
  const results = await Promise.all(
    response.providers.map(async (provider) => {
      try {
        const manifest = await fetchManifest(provider, signal, response.i18n);
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
      errors.push({
        provider: result.provider,
        message: result.error ?? actionMessage("failedToLoadActions", response.i18n),
      });
      continue;
    }

    for (const action of result.manifest.actions) {
      if (!matchesPlacement(action, response.placement)) continue;
      if (!actionMatchesTargetRequirement(action, targetType)) continue;
      actions.push({
        ...action,
        key: actionBusyKey(result.provider.pluginId, action.id),
        provider: result.provider,
        targetPluginId: targetPluginIdForAction(action, result.provider),
      });
    }
  }

  return { actions, errors };
}

async function fetchManifest(
  provider: NormalizedActionProviderConfig,
  signal?: AbortSignal,
  i18n?: ActionsI18nConfig,
): Promise<ActionsManifest> {
  const response = await apiFetch(providerPluginRoute(provider.pluginId, provider.manifestRoute), {
    signal,
  });
  const manifest = await parseApiResponse<unknown>(
    response,
    formatActionMessage("failedToLoadActions", i18n, { provider: provider.pluginId }),
  );
  return parseActionsManifest(manifest, provider);
}

async function resolveFieldAction(
  options: ActionButtonFieldOptions | undefined,
  value: unknown,
  label: string | undefined,
  targetType: ActionTarget["type"],
  signal?: AbortSignal,
  i18n?: ActionsI18nConfig,
): Promise<UiAction> {
  const provider = fieldProvider(options);
  const route = optionalFieldString(options?.route);

  if (route) {
    return fieldActionFromDescriptor(
      {
        confirm: optionalFieldLocalizedString(options?.confirm),
        contextKey: optionalFieldString(options?.contextKey),
        contextValueKey: optionalFieldString(options?.contextValueKey),
        description: optionalFieldLocalizedString(options?.description),
        disabled: options?.disabled,
        icon: optionalFieldString(options?.icon),
        id: optionalFieldString(options?.action) ?? `field.${provider.pluginId}.${route}`,
        label:
          optionalFieldLocalizedString(options?.label) ?? label ?? actionMessage("runAction", i18n),
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

  const manifest = await fetchManifest(provider, signal, i18n);
  const placement = optionalFieldString(options?.placement) ?? "field";
  const action = manifest.actions.find(
    (candidate) =>
      candidate.id === actionId &&
      matchesPlacement(candidate, placement) &&
      actionMatchesTargetRequirement(candidate, targetType),
  );

  if (!action) {
    throw new Error(`Action ${actionId} was not found for ${provider.pluginId}`);
  }

  return fieldActionFromDescriptor(
    {
      ...action,
      confirm: optionalFieldLocalizedString(options?.confirm) ?? action.confirm,
      contextKey: optionalFieldString(options?.contextKey) ?? action.contextKey,
      contextValueKey: optionalFieldString(options?.contextValueKey) ?? action.contextValueKey,
      description: optionalFieldLocalizedString(options?.description) ?? action.description,
      disabled: options?.disabled ?? action.disabled,
      buttonStyle:
        readOptionalButtonStyle(options?.buttonStyle, "buttonStyle") ?? action.buttonStyle,
      feedback: readOptionalFeedback(options?.feedback, "feedback") ?? action.feedback,
      label: optionalFieldLocalizedString(options?.label) ?? action.label,
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
  action: ActionManifestDescriptor,
  provider: NormalizedActionProviderConfig,
): UiAction {
  return {
    ...action,
    key: `field:${provider.pluginId}:${action.id}`,
    provider,
    targetPluginId: targetPluginIdForAction(action, provider),
  };
}

function targetPluginIdForAction(
  action: ActionManifestDescriptor,
  provider: NormalizedActionProviderConfig,
) {
  return "pluginId" in action && action.pluginId ? action.pluginId : provider.pluginId;
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
  return parseApiResponse<T>(response, actionMessage("failedToLoadActions", undefined));
}

async function callAction(
  action: UiAction,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
  signal?: AbortSignal,
  i18n?: ActionsI18nConfig,
  payload?: Record<string, unknown>,
) {
  const label = actionLabel(action, i18n ?? {});
  const response = await apiFetch(
    actionRequestRoute(action),
    actionRequestInit(action, context, target, signal, payload),
  );
  return parseApiResponse<unknown>(
    response,
    formatActionMessage("failedToRunAction", i18n, { action: label }),
  );
}

async function pollActionStatus(
  action: UiAction,
  statusRoute: string,
  signal?: AbortSignal,
  i18n?: ActionsI18nConfig,
): Promise<ActionRunResult> {
  const response = await apiFetch(providerPluginRoute(action.targetPluginId, statusRoute), {
    signal,
  });
  const result = await parseApiResponse<unknown>(
    response,
    formatActionMessage("failedToPollAction", i18n, { action: actionLabel(action, i18n ?? {}) }),
  );
  return normalizeActionRunResult(action, result);
}

function showActionToasts(result: ActionRunResult, i18n: ActionsI18nConfig) {
  for (const toast of actionToasts(result)) {
    const title = localizedString(toast.title, i18n);
    const message = localizedString(toast.message, i18n);
    if (!title && !message) continue;

    actionToastManager.add({
      id: cleanOptionalString(toast.id),
      title: title || message || actionMessage("actionFinished", i18n),
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

function matchesPlacement(action: ActionManifestDescriptor, placement: string | null) {
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
  action: Pick<ActionManifestDescriptor, "buttonStyle"> | null,
  feedback: ButtonFeedback,
  options?: Pick<ActionButtonFieldOptions, "buttonStyle">,
) {
  const base =
    feedback?.phase === "progress" ? undefined : (options?.buttonStyle ?? action?.buttonStyle);
  const style = mergeButtonStyle(base, feedback?.style ?? defaultButtonFeedbackStyle(feedback));
  return style && Object.keys(style).length > 0 ? style : undefined;
}

function buttonInlineStyle(style: CSSProperties | undefined): CSSProperties {
  return style ? { ...buttonLayoutStyle, ...style } : buttonLayoutStyle;
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

function actionIcon(action: ActionManifestDescriptor) {
  return fieldIcon(action.icon);
}

function buttonFeedbackIcon(action: ActionManifestDescriptor, feedback: ButtonFeedback) {
  return feedback ? feedbackIcon(feedback.tone) : actionIcon(action);
}

function fieldButtonFeedbackIcon(
  mode: ActionButtonMode,
  action: ActionManifestDescriptor | null,
  options: ActionButtonFieldOptions | undefined,
  feedback: ButtonFeedback,
) {
  return feedback ? feedbackIcon(feedback.tone) : fieldButtonIcon(mode, action, options);
}

function fieldButtonIcon(
  mode: ActionButtonMode,
  action: ActionManifestDescriptor | null,
  options: ActionButtonFieldOptions | undefined,
) {
  const icon = optionalFieldString(options?.icon);
  if (icon) return fieldIcon(icon);
  if (action) return actionIcon(action);
  if (mode === "clipboard") return fieldIcon("clipboard");
  return <PlayIcon weight="bold" />;
}

function fieldIcon(icon: string | undefined) {
  if (icon === "activity" || icon === "pulse") return <ActivityIcon weight="bold" />;
  if (icon === "refresh" || icon === "sync") return <ArrowsClockwiseIcon weight="bold" />;
  if (icon === "clock") return <ClockIcon weight="bold" />;
  if (icon === "copy" || icon === "clipboard") return <ClipboardTextIcon weight="bold" />;
  if (icon === "download") return <DownloadSimpleIcon weight="bold" />;
  if (icon === "envelope" || icon === "email") return <EnvelopeIcon weight="bold" />;
  if (icon === "key") return <KeyIcon weight="bold" />;
  if (icon === "keyhole") return <KeyholeIcon weight="bold" />;
  if (icon === "lock") return <LockIcon weight="bold" />;
  if (icon === "plus-minus") return <PlusMinusIcon weight="bold" />;
  if (icon === "power") return <PowerIcon weight="bold" />;
  if (icon === "repeat" || icon === "replay") return <RepeatIcon weight="bold" />;
  if (icon === "arrow-counter-clockwise") {
    return <ArrowCounterClockwiseIcon weight="bold" />;
  }
  if (icon === "warning") return <WarningIcon weight="bold" />;
  if (icon === "check") return <CheckCircleIcon weight="bold" />;
  if (icon === "x" || icon === "close") return <XCircleIcon weight="bold" />;
  if (icon === "bolt" || icon === "lightning") return <LightningIcon weight="bold" />;
  return <PlayIcon weight="bold" />;
}

function fieldDefaultButtonLabel(mode: ActionButtonMode, i18n: ActionsI18nConfig) {
  return mode === "clipboard" ? actionMessage("copy", i18n) : actionMessage("runAction", i18n);
}

function feedbackIcon(tone: NoticeTone) {
  if (tone === "warning") return <WarningIcon weight="fill" />;
  if (tone === "danger" || tone === "error") return <XCircleIcon weight="fill" />;
  if (tone === "positive" || tone === "success") return <CheckCircleIcon weight="fill" />;
  return <LightningIcon weight="fill" />;
}

function feedbackFromResult(
  action: ActionManifestDescriptor,
  result: ActionRunResult,
  i18n: ActionsI18nConfig,
  fallbackMessage = formatActionMessage("actionRunning", i18n, {
    action: actionLabel(action, i18n),
  }),
): ButtonFeedback {
  const phase = resultPhase(result);
  return {
    phase,
    tone: resultTone(result),
    message: resultMessage(action, result, phase, fallbackMessage, i18n),
    style: resultFeedbackStyle(action, result, phase),
  };
}

function progressFeedbackForAction(
  action: ActionManifestDescriptor,
  i18n: ActionsI18nConfig,
): ButtonFeedback {
  return {
    phase: "progress",
    tone: "info",
    message:
      localizedString(action.feedback?.progress, i18n) ||
      formatActionMessage("actionRunning", i18n, { action: actionLabel(action, i18n) }),
    style: action.feedback?.progressStyle,
  };
}

function resultTone(result: ActionRunResult): NoticeTone {
  const statusTone = resultToneStatus(result);
  if (statusTone) return statusTone;
  return inlineNotification(result)?.type ?? result.severity ?? "success";
}

function resultMessage(
  action: ActionManifestDescriptor,
  result: ActionRunResult,
  phase: "progress" | "success" | "error",
  fallbackMessage: string,
  i18n: ActionsI18nConfig,
) {
  const phaseMessage =
    phase === "progress"
      ? localizedString(action.feedback?.progress, i18n)
      : phase === "error"
        ? (cleanOptionalString(result.error) ?? localizedString(action.feedback?.error, i18n))
        : (cleanOptionalString(result.success) ?? localizedString(action.feedback?.success, i18n));

  const notificationMessage = localizedString(inlineNotification(result)?.message, i18n);
  const directMessage = cleanOptionalString(result.message);
  const resultLabel = cleanOptionalString(result.label);
  const base =
    directMessage ?? (notificationMessage || phaseMessage || resultLabel || fallbackMessage);
  const progress = progressLabel(result.progress);
  const jobStatus = readJobStatus(result) as ActionJobStatus | null;
  const prefix = jobStatus ? jobStatusLabel(jobStatus, i18n) : null;
  const message =
    prefix && !base.toLowerCase().startsWith(prefix.toLowerCase()) ? `${prefix}: ${base}` : base;

  return progress ? `${message} (${progress})` : message;
}

function inlineNotification(result: ActionRunResult) {
  return Array.isArray(result.notification) ? null : result.notification;
}

function resultFeedbackStyle(
  action: ActionManifestDescriptor,
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

function jobStatusLabel(status: ActionJobStatus | string, i18n: ActionsI18nConfig) {
  if (status === "accepted") return actionMessage("statusAccepted", i18n);
  if (status === "queued") return actionMessage("statusQueued", i18n);
  if (status === "running") return actionMessage("statusRunning", i18n);
  if (status === "succeeded") return actionMessage("statusFinished", i18n);
  if (status === "failed") return actionMessage("statusFailed", i18n);
  if (status === "cancelled") return actionMessage("statusCancelled", i18n);
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
