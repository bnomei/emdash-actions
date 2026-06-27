/**
 * EmDash actions plugin entry: descriptor factory, runtime plugin registration,
 * and provider normalization for the admin discovery route.
 *
 * Host apps register {@link actionsPlugin} in their plugin list; provider plugins
 * export manifests and routes while this package owns the admin trigger surfaces.
 */
import { definePlugin, type PluginDescriptor } from "emdash";
import {
  DEFAULT_ACTION_RUNNER_ROUTE,
  DEFAULT_MANIFEST_ROUTE,
  PACKAGE_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  WIDGET_ID,
  normalizePluginId,
  normalizePluginRoute,
  pluginRoute,
  providerPluginRoute,
} from "./shared";
import { actionMessage, type ActionsI18nConfig } from "./i18n";
import type {
  ActionManifestDescriptor,
  ActionProviderConfig,
  ActionsCreatePluginOptions,
  ActionsDescriptorOptions,
  ActionsManifest,
  ActionsProvidersResponse,
  ActionWidgetSize,
  NormalizedActionProviderConfig,
} from "./types";

export type {
  ActionsI18nConfig,
  ActionsI18nMessages,
  ActionsMessageKey,
  LocalizedString,
} from "./i18n";
export {
  DEFAULT_ACTIONS_I18N,
  DEFAULT_LOCALE,
  actionMessage,
  formatActionMessage,
  localeFallbacks,
  localizedString,
} from "./i18n";
export type {
  ActionButtonMode,
  ActionButtonStyle,
  ActionButtonContext,
  ActionButtonFieldOptions,
  ActionDescriptor,
  DirectActionDescriptor,
  ActionDescriptorMode,
  ActionFeedbackOptions,
  ActionFormField,
  ActionFormFieldType,
  ActionFormMetadata,
  ActionFormOption,
  ActionFormOptionObject,
  ActionFormOptionValue,
  ActionInputField,
  ActionInputMetadata,
  ActionInputType,
  ActionInvocation,
  ActionJobStatus,
  ActionManifestDescriptor,
  ActionMethod,
  ActionProviderConfig,
  ActionResultActionPatch,
  ActionResultEffectPreset,
  ActionResultEffects,
  ActionResultOpenTarget,
  ActionResultMode,
  ActionReloadScope,
  ActionRunnerMetadata,
  ActionRunResult,
  ActionSurface,
  ActionTarget,
  ActionTargetMetadata,
  ActionTargetMetadataInput,
  ActionTargetRequirement,
  ActionTargetType,
  ActionToast,
  ActionToastType,
  ActionTone,
  ActionsCreatePluginOptions,
  ActionsDescriptorOptions,
  ActionsManifest,
  ActionsProvidersResponse,
  ActionWidgetSize,
  NormalizedActionProviderConfig,
  RunnerActionDescriptor,
} from "./types";
export {
  DEFAULT_ACTION_RUNNER_ROUTE,
  DEFAULT_MANIFEST_ROUTE,
  PACKAGE_NAME,
  PLUGIN_ID,
  PLUGIN_VERSION,
  WIDGET_ID,
  normalizePluginId,
  normalizePluginRoute,
  pluginRoute,
  providerPluginRoute,
};

/** Registers the actions dashboard widget and provider discovery options with EmDash. */
export function actionsPlugin(
  options: ActionsDescriptorOptions = {},
): PluginDescriptor<ActionsCreatePluginOptions> {
  const entrypoint = options.entrypoint ?? PACKAGE_NAME;
  const adminEntry = options.adminEntry ?? `${entrypoint}/admin`;

  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: "native",
    entrypoint,
    adminEntry,
    adminWidgets: [widgetMetadata(options)],
    options: {
      adminEntry,
      placement: options.placement === undefined ? "dashboard" : options.placement,
      providers: options.providers ?? [],
      size: options.size,
      title: options.title,
      i18n: options.i18n,
    },
  };
}

/** Defines the actions plugin runtime with the `providers` discovery route and admin entry. */
export function createPlugin(options: ActionsCreatePluginOptions = {}) {
  const providersResponse = providersRoute(options);

  return definePlugin({
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    routes: {
      providers: {
        handler: async () => providersResponse,
      },
    },
    admin: {
      entry: options.adminEntry ?? `${PACKAGE_NAME}/admin`,
      fieldWidgets: [
        {
          fieldTypes: ["json", "string", "text", "url"],
          label: actionMessage("actionButton", options.i18n),
          name: "button",
        },
      ],
      widgets: [widgetMetadata(options)],
    },
  });
}

export function providersRoute(
  options: Pick<ActionsCreatePluginOptions, "providers" | "placement" | "i18n">,
) {
  return {
    placement: options.placement === undefined ? "dashboard" : options.placement,
    providers: normalizeProviders(options.providers),
    i18n: "i18n" in options ? options.i18n : undefined,
  } satisfies ActionsProvidersResponse;
}

/**
 * Normalizes provider entries for the discovery response: validates ids and
 * routes, deduplicates by `pluginId`, and drops invalid entries without failing
 * the whole list.
 */
export function normalizeProviders(
  providers: ActionProviderConfig[] | undefined,
): NormalizedActionProviderConfig[] {
  const seenPluginIds = new Set<string>();
  return (providers ?? []).flatMap((provider) => {
    try {
      const pluginId = normalizePluginId(provider.pluginId);

      if (seenPluginIds.has(pluginId)) return [];
      seenPluginIds.add(pluginId);

      return [
        {
          ...provider,
          pluginId,
          allowedTargetPluginIds: (provider.allowedTargetPluginIds ?? []).map(normalizePluginId),
          manifestRoute: normalizePluginRoute(
            provider.manifestRoute?.trim() || DEFAULT_MANIFEST_ROUTE,
          ),
          ...(provider.runnerRoute
            ? { runnerRoute: normalizePluginRoute(provider.runnerRoute.trim()) }
            : {}),
        },
      ];
    } catch {
      return [];
    }
  });
}

/** Identity helper for provider manifest authoring with type inference. */
export function defineAction<TAction extends ActionManifestDescriptor>(action: TAction): TAction {
  return action;
}

/** Identity helper for provider manifest route handlers. */
export function defineActionsManifest(manifest: ActionsManifest): ActionsManifest {
  return manifest;
}

function widgetMetadata(options: {
  size?: ActionWidgetSize;
  title?: string;
  i18n?: ActionsI18nConfig;
}) {
  return {
    id: WIDGET_ID,
    size: options.size ?? "half",
    title: options.title ?? actionMessage("actions", options.i18n),
  };
}

export const actionSurfacePlugin = actionsPlugin;
export default actionsPlugin;
