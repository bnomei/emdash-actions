import { describe, expect, it } from "vitest";
import { normalizeProviders } from "../src/index";
import {
  normalizeProviderConfig,
  parseActionsManifest,
  providerFromFieldOptions,
  readFieldMode,
} from "../src/admin-manifest";
import { normalizePluginRoute, providerPluginRoute } from "../src/shared";
import type { NormalizedActionProviderConfig } from "../src/types";

const provider: NormalizedActionProviderConfig = {
  allowedTargetPluginIds: ["target"],
  manifestRoute: ".well-known/actions",
  pluginId: "source",
};

describe("admin manifest parsing", () => {
  it("normalizes actions, provider targets, routes, styles, feedback, and result effects", () => {
    const manifest = parseActionsManifest(
      {
        actions: [
          {
            id: " publish ",
            label: " Publish ",
            route: " /jobs/publish ",
            method: "post",
            pluginId: "target",
            tone: "positive",
            placement: " dashboard ",
            payload: { entryId: "entry-1" },
            buttonStyle: {
              backgroundColor: "#fff",
              darkBackgroundColor: "#111",
              resetStyle: false,
            },
            feedback: {
              progress: "Publishing",
              successStyle: { color: "#080" },
            },
            resultEffect: {
              type: "open",
              target: "self",
            },
          },
        ],
      },
      provider,
    );

    expect(manifest.actions).toEqual([
      expect.objectContaining({
        id: "publish",
        label: "Publish",
        method: "POST",
        placement: "dashboard",
        pluginId: "target",
        resultEffect: { type: "open", target: "self" },
        route: "jobs/publish",
        tone: "positive",
      }),
    ]);
    expect(manifest.actions[0]?.buttonStyle).toEqual({
      backgroundColor: "#fff",
      darkBackgroundColor: "#111",
      resetStyle: false,
    });
    expect(manifest.actions[0]?.feedback).toEqual({
      progress: "Publishing",
      successStyle: { color: "#080" },
    });
  });

  it("accepts localized action and provider strings", () => {
    const manifest = parseActionsManifest(
      {
        actions: [
          {
            id: "publish",
            label: { en: "Publish", de: "Veroeffentlichen" },
            route: "/jobs/publish",
            confirm: { en: "Publish now?", de: "Jetzt veroeffentlichen?" },
            description: { en: "Publishes the entry.", de: "Veroeffentlicht den Eintrag." },
            feedback: {
              progress: { en: "Publishing", de: "Veroeffentlicht" },
              success: { en: "Published", de: "Veroeffentlicht" },
            },
          },
        ],
      },
      provider,
    );

    expect(manifest.actions[0]?.label).toEqual({
      de: "Veroeffentlichen",
      en: "Publish",
    });
    expect(manifest.actions[0]?.confirm).toEqual({
      de: "Jetzt veroeffentlichen?",
      en: "Publish now?",
    });
    expect(manifest.actions[0]?.feedback?.progress).toEqual({
      de: "Veroeffentlicht",
      en: "Publishing",
    });

    expect(
      providerFromFieldOptions({
        pluginId: "source",
        providerLabel: { en: "Source", de: "Quelle" },
      }),
    ).toEqual({
      allowedTargetPluginIds: [],
      label: { de: "Quelle", en: "Source" },
      manifestRoute: ".well-known/actions",
      pluginId: "source",
    });
  });

  it("rejects duplicate action ids and disallowed target plugin ids", () => {
    expect(() =>
      parseActionsManifest(
        {
          actions: [
            { id: "sync", label: "Sync", route: "sync" },
            { id: "sync", label: "Sync again", route: "sync-again" },
          ],
        },
        provider,
      ),
    ).toThrow(/Duplicate action id: sync/);

    expect(() =>
      parseActionsManifest(
        {
          actions: [{ id: "sync", label: "Sync", pluginId: "other", route: "sync" }],
        },
        provider,
      ),
    ).toThrow(/other is not an allowed target for source/);
  });

  it("normalizes provider configuration for dashboard and field options", () => {
    expect(
      normalizeProviders([
        {
          allowedTargetPluginIds: ["target"],
          manifestRoute: " /actions.json ",
          pluginId: " source ",
        },
      ]),
    ).toEqual([
      {
        allowedTargetPluginIds: ["target"],
        manifestRoute: "actions.json",
        pluginId: "source",
      },
    ]);

    expect(
      normalizeProviderConfig({
        allowedTargetPluginIds: ["target"],
        manifestRoute: " /manifest ",
        pluginId: " source ",
      }),
    ).toEqual({
      allowedTargetPluginIds: ["target"],
      manifestRoute: "manifest",
      pluginId: "source",
    });

    expect(
      providerFromFieldOptions({
        allowedTargetPluginIds: ["target"],
        manifestRoute: "/field-actions",
        pluginId: " source ",
        providerLabel: "Source",
      }),
    ).toEqual({
      allowedTargetPluginIds: ["target"],
      label: "Source",
      manifestRoute: "field-actions",
      pluginId: "source",
    });
  });

  it("rejects unsafe routes and unsupported field modes", () => {
    expect(normalizePluginRoute("/reports/download")).toBe("reports/download");
    expect(providerPluginRoute("source", "/reports/download")).toBe(
      "/_emdash/api/plugins/source/reports/download",
    );

    expect(() => normalizePluginRoute("../secret")).toThrow(/Unsafe plugin route/);
    expect(() => normalizePluginRoute("https://example.com/file")).toThrow(/Unsafe plugin route/);
    expect(() => readFieldMode("delete")).toThrow(/Unsupported action field mode/);
  });
});
