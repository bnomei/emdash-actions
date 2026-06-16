import { definePlugin, type PluginDescriptor } from "emdash";
import {
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
import type {
  ActionDescriptor,
  ActionProviderConfig,
  ActionsCreatePluginOptions,
  ActionsDescriptorOptions,
  ActionsManifest,
  ActionsProvidersResponse,
  ActionWidgetSize,
  NormalizedActionProviderConfig,
} from "./types";

export type {
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
  ActionResultMode,
  ActionRunResult,
  ActionSurface,
  ActionToast,
  ActionToastType,
  ActionTone,
  ActionsCreatePluginOptions,
  ActionsDescriptorOptions,
  ActionsManifest,
  ActionsProvidersResponse,
  ActionWidgetSize,
  NormalizedActionProviderConfig,
} from "./types";
export {
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
          label: "Action Button",
          name: "button",
        },
      ],
      widgets: [widgetMetadata(options)],
    },
  });
}

export function providersRoute(
  options: Pick<ActionsCreatePluginOptions, "providers" | "placement">,
) {
  return {
    placement: options.placement === undefined ? "dashboard" : options.placement,
    providers: normalizeProviders(options.providers),
  } satisfies ActionsProvidersResponse;
}

export function normalizeProviders(
  providers: ActionProviderConfig[] | undefined,
): NormalizedActionProviderConfig[] {
  return (providers ?? []).flatMap((provider) => {
    const pluginId = normalizePluginId(provider.pluginId);

    return [
      {
        ...provider,
        pluginId,
        allowedTargetPluginIds: (provider.allowedTargetPluginIds ?? []).map(normalizePluginId),
        manifestRoute: normalizePluginRoute(
          provider.manifestRoute?.trim() || DEFAULT_MANIFEST_ROUTE,
        ),
      },
    ];
  });
}

export function defineAction(action: ActionDescriptor): ActionDescriptor {
  return action;
}

export function defineActionsManifest(manifest: ActionsManifest): ActionsManifest {
  return manifest;
}

function widgetMetadata(options: { size?: ActionWidgetSize; title?: string }) {
  return {
    id: WIDGET_ID,
    size: options.size ?? "half",
    title: options.title ?? "Actions",
  };
}

export const actionSurfacePlugin = actionsPlugin;
export default actionsPlugin;
