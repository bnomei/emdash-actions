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

export function normalizeProviders(
  providers: ActionProviderConfig[] | undefined,
): NormalizedActionProviderConfig[] {
  const seenPluginIds = new Set<string>();
  return (providers ?? []).flatMap((provider) => {
    // Isolate each provider: a single invalid plugin id or route must degrade
    // only that provider and leave the others loadable, mirroring the
    // admin-side per-provider ProviderError handling. Returning [] from the
    // flatMap callback drops just the offending entry.
    try {
      const pluginId = normalizePluginId(provider.pluginId);

      // Drop duplicate provider entries sharing a pluginId: action keys are
      // `pluginId:action.id`, so a repeat would collide React list keys and
      // couple busy state across the two buttons. Keep the first entry.
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

export function defineAction<TAction extends ActionManifestDescriptor>(action: TAction): TAction {
  return action;
}

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
