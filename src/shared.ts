export const PACKAGE_NAME = "@bnomei/emdash-actions";
export const PLUGIN_ID = "actions";
export const PLUGIN_VERSION = "0.2.5";
export const WIDGET_ID = "actions";
export const DEFAULT_MANIFEST_ROUTE = ".well-known/actions";

const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ROUTE_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;

export function pluginRoute(route = "providers") {
  return providerPluginRoute(PLUGIN_ID, route);
}

export function providerPluginRoute(pluginId: string, route: string) {
  const cleanPluginId = normalizePluginId(pluginId);
  const cleanRoute = normalizePluginRoute(route);
  return `/_emdash/api/plugins/${encodeURIComponent(cleanPluginId)}/${cleanRoute}`;
}

export function normalizePluginId(pluginId: string) {
  const cleanPluginId = pluginId.trim();
  if (!PLUGIN_ID_PATTERN.test(cleanPluginId)) {
    throw new Error(`Invalid plugin id: ${pluginId}`);
  }
  return cleanPluginId;
}

export function normalizePluginRoute(route: string) {
  const cleanRoute = route.trim().replace(/^\/+/, "");
  if (!cleanRoute || cleanRoute.length > 160) {
    throw new Error("Invalid plugin route");
  }
  if (/[:?#\\%\s]/.test(cleanRoute)) {
    throw new Error(`Unsafe plugin route: ${route}`);
  }

  for (const segment of cleanRoute.split("/")) {
    if (!segment || segment === "." || segment === ".." || !ROUTE_SEGMENT_PATTERN.test(segment)) {
      throw new Error(`Unsafe plugin route: ${route}`);
    }
  }

  return cleanRoute;
}
