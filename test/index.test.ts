import { describe, expect, it } from "vitest";
import type { RouteContext } from "emdash";
import { version } from "../package.json";
import { actionsPlugin, createPlugin, normalizeProviders, PLUGIN_VERSION } from "../src/index";

describe("EmDash native registration", () => {
  it("keeps descriptor and resolved runtime metadata aligned with the package", async () => {
    const descriptor = actionsPlugin({
      adminEntry: "custom/admin",
      providers: [{ pluginId: "cache-actions", manifestRoute: "/actions" }],
      size: "third",
      title: "Maintenance",
    });
    const plugin = createPlugin(descriptor.options);

    expect(PLUGIN_VERSION).toBe(version);
    expect(descriptor).toMatchObject({ id: "actions", version, format: "native" });
    expect(plugin).toMatchObject({ id: "actions", version });
    expect(plugin.admin.entry).toBe(descriptor.adminEntry);
    expect(plugin.admin.widgets).toEqual([{ id: "actions", title: "Maintenance", size: "third" }]);
    expect(plugin.admin.widgets).toEqual(descriptor.adminWidgets);
    expect(plugin.admin.fieldWidgets).toEqual([
      { name: "button", label: "Action Button", fieldTypes: ["json", "string", "text", "url"] },
    ]);
    const route = plugin.routes.providers;
    expect(route.permission).toBe("plugins:read");
    expect(route.public).not.toBe(true);
    await expect(route.handler({} as RouteContext)).resolves.toEqual({
      placement: "dashboard",
      providers: [
        { pluginId: "cache-actions", manifestRoute: "actions", allowedTargetPluginIds: [] },
      ],
      i18n: undefined,
    });
  });
});

describe("normalizeProviders", () => {
  it("normalizes plugin ids and routes for valid providers", () => {
    expect(
      normalizeProviders([{ pluginId: "good-provider", manifestRoute: "actions/manifest" }]),
    ).toEqual([
      {
        pluginId: "good-provider",
        allowedTargetPluginIds: [],
        manifestRoute: "actions/manifest",
      },
    ]);
  });

  it("isolates an invalid provider and keeps the valid ones", () => {
    const result = normalizeProviders([
      { pluginId: "good-provider" },
      { pluginId: "bad id!" },
      { pluginId: "another-good" },
    ]);

    expect(result.map((provider) => provider.pluginId)).toEqual(["good-provider", "another-good"]);
  });

  it("drops a provider with an invalid route without aborting the rest", () => {
    const result = normalizeProviders([
      { pluginId: "good-provider" },
      { pluginId: "bad-route", manifestRoute: "a?b" },
    ]);

    expect(result.map((provider) => provider.pluginId)).toEqual(["good-provider"]);
  });

  it("deduplicates provider entries sharing a pluginId, keeping the first", () => {
    const result = normalizeProviders([
      { pluginId: "cache-actions", manifestRoute: "actions" },
      { pluginId: "cache-actions", manifestRoute: "other" },
      { pluginId: "second" },
    ]);

    expect(result.map((provider) => provider.pluginId)).toEqual(["cache-actions", "second"]);
    expect(result[0]?.manifestRoute).toBe("actions");
  });

  it("does not reserve a provider id when that provider fails normalization", () => {
    const result = normalizeProviders([
      { pluginId: "cache-actions", manifestRoute: "a?b" },
      { pluginId: "cache-actions", manifestRoute: "actions" },
    ]);

    expect(result.map((provider) => provider.pluginId)).toEqual(["cache-actions"]);
    expect(result[0]?.manifestRoute).toBe("actions");
  });
});
