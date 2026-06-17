import { describe, expect, it, vi } from "vitest";
import {
  actionResultEffects,
  asDownloadEffect,
  clipboardEffectText,
  mergeActionPatch,
  normalizeActionRunResult,
  runActionEffects,
  safeBrowserUrl,
} from "../src/admin-effects";
import type { ActionEffectTarget } from "../src/admin-effects";

const action: ActionEffectTarget = {
  id: "publish",
  label: "Publish",
  route: "publish",
  targetPluginId: "source",
};

describe("admin action effects", () => {
  it("normalizes string results into configured result-effect presets", () => {
    expect(normalizeActionRunResult({ resultEffect: "clipboard" }, "copied")).toEqual({
      effects: { clipboard: { text: "copied" } },
      ok: true,
      status: 200,
    });

    expect(
      normalizeActionRunResult(
        { resultEffect: { type: "download", filename: "report.csv" } },
        "/r",
      ),
    ).toEqual({
      effects: { download: { filename: "report.csv", url: "/r" } },
      ok: true,
      status: 200,
    });
  });

  it("merges action patches while preserving null removal semantics", () => {
    const patched = mergeActionPatch(
      {
        id: "publish",
        label: "Publish",
        route: "publish",
        icon: "bolt",
        payload: { current: true },
        tone: "info",
      },
      {
        confirm: null,
        disabled: true,
        icon: null,
        label: "Published",
        payload: null,
        tone: null,
      },
    );

    expect(patched).toEqual({
      id: "publish",
      label: "Published",
      route: "publish",
      disabled: true,
    });
  });

  it("collects top-level effects and dispatches side effects through injectable handlers", async () => {
    const writeClipboardText = vi.fn<[(text: string) => Promise<void>]>(async () => undefined);
    const runDownloadEffect = vi.fn(async () => undefined);
    const runOpenEffect = vi.fn();
    const scheduleReload = vi.fn();

    const result = {
      clipboard: { text: "entry-1" },
      download: { filename: "entry.json", route: "exports/entry" },
      open: { target: "self" as const, url: "/admin/content/posts/entry-1" },
      reload: { delayMs: 25 },
    };

    expect(actionResultEffects(result)).toEqual(result);

    await runActionEffects(action, result, {
      runDownloadEffect,
      runOpenEffect,
      scheduleReload,
      writeClipboardText,
    });

    expect(writeClipboardText).toHaveBeenCalledWith("entry-1");
    expect(runDownloadEffect).toHaveBeenCalledWith(action, {
      filename: "entry.json",
      route: "exports/entry",
      url: undefined,
    });
    expect(runOpenEffect).toHaveBeenCalledWith({
      target: "self",
      url: "/admin/content/posts/entry-1",
    });
    expect(scheduleReload).toHaveBeenCalledWith(action, 25);
  });

  it("validates clipboard, download, and browser URL effects", () => {
    expect(clipboardEffectText("copy me")).toBe("copy me");
    expect(() => clipboardEffectText({ text: 1 } as never)).toThrow(/requires text/);
    expect(asDownloadEffect({ route: "exports/report", filename: "report.csv" })).toEqual({
      filename: "report.csv",
      route: "exports/report",
      url: undefined,
    });
    expect(() => asDownloadEffect({})).toThrow(/requires a URL or route/);

    expect(safeBrowserUrl("/admin").href).toBe("http://localhost/admin");
    expect(() => safeBrowserUrl("javascript:alert(1)")).toThrow(/must use http/);
  });
});
