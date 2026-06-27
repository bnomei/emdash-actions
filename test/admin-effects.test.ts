import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionPatchChangesPayload,
  actionPatchFromResult,
  actionResultEffects,
  asDownloadEffect,
  asReloadEffect,
  clipboardEffectText,
  mergeActionPatch,
  normalizeActionRunResult,
  runActionEffects,
  runOpenEffect,
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

  it("coerces wrong-typed status and ok on object results", () => {
    expect(normalizeActionRunResult({}, { status: "500" })).toEqual({ status: 500 });
    expect(normalizeActionRunResult({}, { status: "202", statusRoute: "jobs/1" })).toEqual({
      status: 202,
      statusRoute: "jobs/1",
    });
    expect(normalizeActionRunResult({}, { status: "weird", message: "x" })).toEqual({
      message: "x",
    });
    expect(normalizeActionRunResult({}, { ok: true, status: 200 })).toEqual({
      ok: true,
      status: 200,
    });
    expect(normalizeActionRunResult({}, { ok: "false", status: 200 })).toEqual({
      ok: false,
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
    expect(() => actionPatchFromResult({ action: { label: "" } })).not.toThrow();
    expect(actionPatchFromResult({ action: { label: "   " } })).toBe(null);
    expect(actionPatchFromResult({ action: { label: "", tone: "info" } })).toEqual({
      tone: "info",
    });
    expect(actionPatchFromResult({ action: { icon: 42, disabled: true } })).toEqual({
      disabled: true,
    });
  });

  it("detects when a result patch changes the action payload", () => {
    expect(actionPatchChangesPayload({ action: { payload: { format: "short" } } })).toBe(true);
    expect(actionPatchChangesPayload({ action: { payload: null } })).toBe(true);
    expect(actionPatchChangesPayload({ action: { label: "Done" } })).toBe(false);
    expect(actionPatchChangesPayload({ ok: true, status: 200 })).toBe(false);
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
    expect(scheduleReload).toHaveBeenCalledWith(action, { delayMs: 25, scope: "field" }, undefined);
  });

  it("cancels a scheduled reload timer when the lifetime signal aborts", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    const dispatchEvent = vi.fn(() => true);
    vi.stubGlobal("dispatchEvent", dispatchEvent);
    vi.stubGlobal("location", { reload });
    const controller = new AbortController();

    scheduleReload(action, { delayMs: 5000 }, controller.signal);
    controller.abort();
    await vi.runAllTimersAsync();

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    scheduleReload(action, { delayMs: 0 }, controller.signal);
    await vi.runAllTimersAsync();
    expect(reload).not.toHaveBeenCalled();
  });

  it("isolates a failing effect so remaining effects still run", async () => {
    const writeClipboardText = vi.fn(async () => {
      throw new Error("Clipboard access requires HTTPS or localhost.");
    });
    const scheduleReload = vi.fn();
    const onEffectError = vi.fn();

    await expect(
      runActionEffects(
        action,
        { clipboard: { text: "x" }, reload: true },
        { writeClipboardText, scheduleReload, onEffectError },
      ),
    ).resolves.toBeUndefined();

    expect(writeClipboardText).toHaveBeenCalledTimes(1);
    expect(scheduleReload).toHaveBeenCalledTimes(1);
    expect(onEffectError).toHaveBeenCalledWith("clipboard", expect.any(Error));
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

    expect(safeBrowserUrl("//evil.example/x").href).toBe("http://evil.example/x");
    expect(() => safeBrowserUrl("//evil.example/x", { sameOrigin: true })).toThrow(
      /current origin/,
    );
    expect(() => safeBrowserUrl("https://evil.example/x", { sameOrigin: true })).toThrow(
      /current origin/,
    );
    expect(safeBrowserUrl("/admin", { sameOrigin: true }).href).toBe("http://localhost/admin");
  });

  it("blocks off-origin same-tab navigation from open effects", () => {
    const assign = vi.fn();
    const open = vi.fn();
    vi.stubGlobal("location", { assign });
    vi.stubGlobal("open", open);

    expect(() => runOpenEffect({ url: "//evil.example/phish", target: "self" })).toThrow(
      /current origin/,
    );
    expect(assign).not.toHaveBeenCalled();

    runOpenEffect({ url: "/admin/page", target: "self" });
    expect(assign).toHaveBeenCalledWith("http://localhost/admin/page");

    runOpenEffect({ url: "//external.example/docs", target: "blank" });
    expect(open).toHaveBeenCalledWith(
      "http://external.example/docs",
      "_blank",
      "noopener,noreferrer",
    );
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
