/**
 * Action invocation assembly: route and method selection, request bodies, and
 * pre-submit validation for manifest and field-configured actions.
 *
 * Runner actions post to the provider runner route; direct actions hit the
 * action's own plugin route with an optional {@link ActionInvocation} envelope.
 */
import { mergeActionContextPayload } from "./admin-context";
import {
  formOptionValue,
  hasJsonBody,
  isValidFormFieldValue,
  readPath,
} from "./admin-manifest";
import { DEFAULT_ACTION_RUNNER_ROUTE, normalizePluginRoute, providerPluginRoute } from "./shared";
import type {
  ActionButtonContext,
  ActionFormField,
  ActionFormMetadata,
  ActionInvocation,
  ActionManifestDescriptor,
  ActionMethod,
  ActionRunnerMetadata,
  ActionTarget,
  ActionTargetMetadata,
  ActionTargetMetadataInput,
  ActionTargetType,
  NormalizedActionProviderConfig,
} from "./types";

export type RunnableAction = ActionManifestDescriptor & {
  provider: Pick<NormalizedActionProviderConfig, "pluginId" | "runnerRoute">;
  targetPluginId: string;
};

export function isRunnerAction(action: Pick<ActionManifestDescriptor, "mode" | "runner">) {
  return action.mode === "runner" || action.runner !== undefined;
}

export function providerRunnerRoute(provider: Pick<NormalizedActionProviderConfig, "runnerRoute">) {
  return normalizePluginRoute(provider.runnerRoute?.trim() || DEFAULT_ACTION_RUNNER_ROUTE);
}

export function actionRunnerRoute(action: RunnableAction) {
  const route = runnerMetadata(action.runner)?.route;
  return route ? normalizePluginRoute(route) : providerRunnerRoute(action.provider);
}

export function actionRequestMethod(action: RunnableAction): ActionMethod {
  const method = "method" in action ? action.method : undefined;
  return isRunnerAction(action) ? "POST" : (method ?? "POST");
}

export function actionRequestRoute(action: RunnableAction) {
  if (isRunnerAction(action)) {
    return providerPluginRoute(action.provider.pluginId, actionRunnerRoute(action));
  }

  return providerPluginRoute(action.targetPluginId, directActionRoute(action));
}

export function actionMatchesTargetRequirement(
  action: Pick<ActionManifestDescriptor, "target">,
  targetType: ActionTarget["type"],
) {
  const surfaces = targetMetadata(action.target)?.surfaces;
  return !surfaces || surfaces.includes(targetType);
}

export function actionInvocationForAction(
  action: Pick<ActionManifestDescriptor, "contextKey" | "contextValueKey" | "id" | "payload">,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
  payload: Record<string, unknown> | undefined = undefined,
): ActionInvocation {
  const invocation: ActionInvocation = {
    invocationId: createActionInvocationId(),
    actionId: action.id,
    payload: mergeActionPayload(action.payload, payload),
  };

  if (context !== undefined) invocation.context = context;
  if (target !== undefined) invocation.target = target;
  return invocation;
}

export function actionRequestBody(
  action: RunnableAction,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
  payload: Record<string, unknown> | undefined = undefined,
) {
  if (isRunnerAction(action)) return actionInvocationForAction(action, context, target, payload);
  return (
    mergeActionContextPayload(mergeActionPayload(action.payload, payload), action, context) ?? {}
  );
}

/** Builds fetch init for an action call, including JSON bodies for body-ful methods. */
export function actionRequestInit(
  action: RunnableAction,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
  signal?: AbortSignal,
  payload?: Record<string, unknown>,
): RequestInit {
  const method = actionRequestMethod(action);
  const headers = new Headers();
  const init: RequestInit = { headers, method, signal };

  const body = actionRequestBody(action, context, target, payload);
  const hasBodyContent = typeof body === "object" && body !== null && Object.keys(body).length > 0;
  // DELETE still carries a JSON body when the action computed parameters.
  if (hasJsonBody(method) || hasBodyContent) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  return init;
}

export function createActionInvocationId() {
  const crypto = globalThis.crypto;
  if (crypto && "randomUUID" in crypto) return crypto.randomUUID();
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function mergeActionPayload(
  defaults: Record<string, unknown> | undefined,
  values: Record<string, unknown> | undefined,
) {
  const payload = {
    ...defaults,
    ...values,
  };
  return Object.keys(payload).length > 0 ? payload : {};
}

export function actionFormInitialValues(
  form: ActionFormMetadata | undefined,
  payload: Record<string, unknown> | undefined = undefined,
) {
  const values: Record<string, unknown> = {};
  for (const field of form?.fields ?? []) {
    if (payload && Object.hasOwn(payload, field.name)) values[field.name] = payload[field.name];
    else if (Object.hasOwn(field, "default")) values[field.name] = field.default;
    else if (field.type === "boolean") values[field.name] = false;
  }
  return values;
}

export function actionFormValuesWithFieldValue(
  form: ActionFormMetadata | undefined,
  values: Record<string, unknown>,
  valueKey: string | undefined,
  value: unknown,
) {
  if (!valueKey || !form?.fields.some((field) => field.name === valueKey)) return values;
  if (Object.is(values[valueKey], value)) return values;
  return { ...values, [valueKey]: value };
}

export function actionFormPayload(
  form: ActionFormMetadata | undefined,
  values: Record<string, unknown> | undefined,
) {
  if (!form || !values) return undefined;

  const payload: Record<string, unknown> = {};
  for (const field of form.fields) {
    const value = values[field.name];
    if (isMissingFormValue(value)) continue;
    payload[field.name] = coerceFormFieldValue(field, value);
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

export function actionFormValidationError(
  form: ActionFormMetadata | undefined,
  values: Record<string, unknown> | undefined,
) {
  if (!form) return null;

  for (const field of form.fields) {
    const value = values?.[field.name];
    if (field.required && isMissingFormValue(value)) {
      return `${field.name} is required.`;
    }
    if (isMissingFormValue(value)) continue;
    if (!isValidFormFieldValue(field, value)) {
      return `${field.name} is invalid.`;
    }
  }
  return null;
}

export function actionTargetValidationError(
  metadata: ActionTargetMetadataInput | undefined,
  target: ActionTarget | undefined,
) {
  const targetRequirement = targetMetadata(metadata);
  if (!targetRequirement) return null;
  if (targetRequirement.required && !target) return "Action target is missing.";
  if (!target) return null;
  if (targetRequirement.surfaces && !targetRequirement.surfaces.includes(target.type)) {
    return "Action target surface is not available.";
  }
  if (targetRequirement.kind && target.kind !== targetRequirement.kind) {
    return "Action target kind is not available.";
  }
  for (const key of targetRequirement.idKeys ?? []) {
    if (isMissingFormValue(readPath(target, key))) {
      return `Action target ${key} is missing.`;
    }
  }
  if (targetRequirement.idFrom && isMissingFormValue(readPath(target, targetRequirement.idFrom))) {
    return `Action target ${targetRequirement.idFrom} is missing.`;
  }
  return null;
}

/** Returns the first client-side validation error blocking submit, if any. */
export function actionSubmitValidationError(
  action: Pick<ActionManifestDescriptor, "form" | "target">,
  target: ActionTarget | undefined,
  formValues: Record<string, unknown> | undefined,
) {
  return (
    actionTargetValidationError(action.target, target) ??
    actionFormValidationError(action.form, formValues)
  );
}

function runnerMetadata(
  runner: true | ActionRunnerMetadata | undefined,
): ActionRunnerMetadata | undefined {
  return runner && runner !== true ? runner : undefined;
}

function coerceFormFieldValue(field: ActionFormField, value: unknown) {
  if (field.type === "number") return typeof value === "number" ? value : Number(value);
  if (field.type === "integer") {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : number;
  }
  if (field.type === "boolean") return value === true || value === "true";
  if (field.type === "select" && field.options) {
    const option = field.options.find(
      (candidate) => String(formOptionValue(candidate)) === String(value),
    );
    return option ? formOptionValue(option) : value;
  }
  return value;
}

function targetMetadata(
  value: ActionTargetMetadataInput | undefined,
): ActionTargetMetadata | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return { surfaces: [value] };
  if (Array.isArray(value)) return { surfaces: value as readonly ActionTargetType[] };
  return value;
}

function isMissingFormValue(value: unknown) {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && !value.trim();
}

function directActionRoute(action: RunnableAction) {
  const route = "route" in action ? action.route : undefined;
  if (!route) throw new Error("Direct action route is missing.");
  return route;
}
