/**
 * Plugin identity constants and safe route construction for the EmDash actions
 * plugin API surface (`/_emdash/api/plugins/...`).
 *
 * Route normalization is the security boundary: plugin ids and path segments are
 * validated before they are embedded in admin fetch URLs.
 */
export const PACKAGE_NAME = "@bnomei/emdash-actions";
export const PLUGIN_ID = "actions";
export const PLUGIN_VERSION = "0.4.0";
export const WIDGET_ID = "actions";
export const DEFAULT_MANIFEST_ROUTE = ".well-known/actions";
export const DEFAULT_ACTION_RUNNER_ROUTE = ".well-known/actions/run";

const PLUGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ROUTE_SEGMENT_PATTERN = /^[A-Za-z0-9._~-]+$/;

/** Builds the actions plugin route for a named handler (default `providers`). */
export function pluginRoute(route = "providers") {
  return providerPluginRoute(PLUGIN_ID, route);
}

/** Builds a provider plugin API URL from a validated plugin id and route. */
export function providerPluginRoute(pluginId: string, route: string) {
  const cleanPluginId = normalizePluginId(pluginId);
  const cleanRoute = normalizePluginRoute(route);
  return `/_emdash/api/plugins/${encodeURIComponent(cleanPluginId)}/${cleanRoute}`;
}

/** Validates and trims a plugin id; throws when the id is outside the allowed charset. */
export function normalizePluginId(pluginId: string) {
  const cleanPluginId = pluginId.trim();
  if (!PLUGIN_ID_PATTERN.test(cleanPluginId)) {
    throw new Error(`Invalid plugin id: ${pluginId}`);
  }
  return cleanPluginId;
}

/**
 * Normalizes a relative plugin route: strips leading slashes, rejects unsafe
 * segments (`..`, encoded delimiters, overlong paths), and returns the clean path.
 */
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
