import { describe, expect, it } from "vitest";
import { normalizeProviders } from "../src/index";

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

    expect(result.map((provider) => provider.pluginId)).toEqual([
      "good-provider",
      "another-good",
    ]);
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
});
