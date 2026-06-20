import { mergeActionContextPayload } from "./admin-context";
import { hasJsonBody } from "./admin-manifest";
import { DEFAULT_ACTION_RUNNER_ROUTE, normalizePluginRoute, providerPluginRoute } from "./shared";
import type {
  ActionButtonContext,
  ActionInvocation,
  ActionManifestDescriptor,
  ActionMethod,
  ActionTarget,
  NormalizedActionProviderConfig,
} from "./types";

export type RunnableAction = ActionManifestDescriptor & {
  provider: Pick<NormalizedActionProviderConfig, "pluginId" | "runnerRoute">;
  targetPluginId: string;
};

export function isRunnerAction(action: Pick<ActionManifestDescriptor, "mode">) {
  return action.mode === "runner";
}

export function providerRunnerRoute(provider: Pick<NormalizedActionProviderConfig, "runnerRoute">) {
  return normalizePluginRoute(provider.runnerRoute?.trim() || DEFAULT_ACTION_RUNNER_ROUTE);
}

export function actionRequestMethod(action: RunnableAction): ActionMethod {
  const method = "method" in action ? action.method : undefined;
  return isRunnerAction(action) ? "POST" : (method ?? "POST");
}

export function actionRequestRoute(action: RunnableAction) {
  if (isRunnerAction(action)) {
    return providerPluginRoute(action.provider.pluginId, providerRunnerRoute(action.provider));
  }

  return providerPluginRoute(action.targetPluginId, directActionRoute(action));
}

export function actionMatchesTargetRequirement(
  action: Pick<ActionManifestDescriptor, "target">,
  targetType: ActionTarget["type"],
) {
  if (!action.target) return true;
  return Array.isArray(action.target)
    ? action.target.includes(targetType)
    : action.target === targetType;
}

export function actionInvocationForAction(
  action: Pick<ActionManifestDescriptor, "contextKey" | "contextValueKey" | "id" | "payload">,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
): ActionInvocation {
  const invocation: ActionInvocation = {
    actionId: action.id,
    payload: mergeActionContextPayload(action.payload, action, context) ?? {},
  };

  if (context !== undefined) invocation.context = context;
  if (target !== undefined) invocation.target = target;
  return invocation;
}

export function actionRequestBody(
  action: RunnableAction,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
) {
  if (isRunnerAction(action)) return actionInvocationForAction(action, context, target);
  return mergeActionContextPayload(action.payload, action, context) ?? {};
}

export function actionRequestInit(
  action: RunnableAction,
  context: ActionButtonContext | undefined,
  target: ActionTarget | undefined,
  signal?: AbortSignal,
): RequestInit {
  const method = actionRequestMethod(action);
  const headers = new Headers();
  const init: RequestInit = { headers, method, signal };

  if (hasJsonBody(method)) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(actionRequestBody(action, context, target));
  }

  return init;
}

function directActionRoute(action: RunnableAction) {
  const route = "route" in action ? action.route : undefined;
  if (!route) throw new Error("Direct action route is missing.");
  return route;
}
