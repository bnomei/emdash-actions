import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionPatchFromResult,
  actionResultEffects,
  asDownloadEffect,
  asReloadEffect,
  clipboardEffectText,
  mergeActionPatch,
  normalizeActionRunResult,
  runActionEffects,
  safeBrowserUrl,
  scheduleReload,
} from "../src/admin-effects";
import type { ActionEffectTarget } from "../src/admin-effects";

const action: ActionEffectTarget = {
  id: "publish",
  label: "Publish",
  route: "publish",
  targetPluginId: "source",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it("drops malformed action patch fields instead of throwing on success", () => {
    // An invalid optional patch field must not abort the post-success
    // sequence (effects / field writeback); it is dropped, valid fields kept.
    expect(() => actionPatchFromResult({ action: { label: "" } })).not.toThrow();
    expect(actionPatchFromResult({ action: { label: "   " } })).toBe(null);
    expect(actionPatchFromResult({ action: { label: "", tone: "info" } })).toEqual({
      tone: "info",
    });
    expect(actionPatchFromResult({ action: { icon: 42, disabled: true } })).toEqual({
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
      reload: { delayMs: 25, scope: "field" as const },
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
    expect(scheduleReload).toHaveBeenCalledWith(action, { delayMs: 25, scope: "field" });
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
    expect(asReloadEffect({ delayMs: 10, scope: "entry" })).toEqual({
      delayMs: 10,
      scope: "entry",
    });
    expect(() => asReloadEffect({ scope: "site" } as never)).toThrow(/Unsupported reload scope/);

    expect(safeBrowserUrl("/admin").href).toBe("http://localhost/admin");
    expect(() => safeBrowserUrl("javascript:alert(1)")).toThrow(/must use http/);
  });

  it("dispatches scoped reload events and falls back to page reload when unhandled", async () => {
    vi.useFakeTimers();
    const dispatchEvent = vi.fn(() => true);
    const reload = vi.fn();
    vi.stubGlobal("dispatchEvent", dispatchEvent);
    vi.stubGlobal("location", { reload });

    scheduleReload(action, { delayMs: 0, scope: "field" });
    await vi.runAllTimersAsync();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({
      detail: {
        scope: "field",
      },
      type: "emdash-actions:reload",
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not force page reload when a scoped reload event is handled", async () => {
    vi.useFakeTimers();
    const dispatchEvent = vi.fn(() => false);
    const reload = vi.fn();
    vi.stubGlobal("dispatchEvent", dispatchEvent);
    vi.stubGlobal("location", { reload });

    scheduleReload(action, { delayMs: 0, scope: "entry" });
    await vi.runAllTimersAsync();

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
