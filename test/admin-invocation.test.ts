import { describe, expect, it } from "vitest";
import {
  actionFormInitialValues,
  actionFormPayload,
  actionFormValidationError,
  actionFormValuesWithFieldValue,
  actionMatchesTargetRequirement,
  actionInvocationForAction,
  actionRequestInit,
  actionRequestRoute,
  actionSubmitValidationError,
} from "../src/admin-invocation";
import type { RunnableAction } from "../src/admin-invocation";
import type { ActionButtonContext, NormalizedActionProviderConfig } from "../src/types";

const provider = {
  allowedTargetPluginIds: [],
  manifestRoute: ".well-known/actions",
  pluginId: "source",
} satisfies NormalizedActionProviderConfig;

describe("admin action invocation requests", () => {
  it("keeps direct route actions on their declared route with the old payload shape", () => {
    const action = {
      id: "field.slugify",
      label: "Slugify",
      payload: { static: true, value: "from-manifest" },
      provider,
      route: "field/slugify",
      targetPluginId: "source",
    };

    const init = actionRequestInit(action, undefined, {
      type: "field",
      surface: "field",
      fieldName: "title",
      value: "Ignored by direct body",
    });

    expect(actionRequestRoute(action)).toBe("/_emdash/api/plugins/source/field/slugify");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ static: true, value: "from-manifest" }));
  });

  it("sends a JSON body for a DELETE action that carries form/payload input", () => {
    const action = {
      id: "purge",
      label: "Purge",
      method: "DELETE" as const,
      provider,
      route: "purge",
      targetPluginId: "source",
    };

    const init = actionRequestInit(action, undefined, undefined, undefined, { scope: "drafts" });

    expect(init.method).toBe("DELETE");
    expect(init.headers).toBeInstanceOf(Headers);
    expect((init.headers as Headers).get("Content-Type")).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ scope: "drafts" }));
  });

  it("sends no body for a parameterless DELETE action", () => {
    const action = {
      id: "purge",
      label: "Purge",
      method: "DELETE" as const,
      provider,
      route: "purge",
      targetPluginId: "source",
    };

    const init = actionRequestInit(action, undefined, undefined);

    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect((init.headers as Headers).get("Content-Type")).toBe(null);
  });

  it("posts runner actions to the provider runner route as ActionInvocation", () => {
    const context: ActionButtonContext = {
      currentUser: { id: "user-1" },
      entryId: "post-1",
      fieldName: "title",
      fieldValue: "Hello",
      surface: "field",
    };
    const action = {
      contextKey: "context",
      id: "field.summarize",
      label: "Summarize",
      runner: true,
      payload: { tone: "short" },
      provider,
      targetPluginId: "source",
    } as const;

    const target = {
      type: "field",
      surface: "field",
      entryId: "post-1",
      fieldName: "title",
      value: "Hello",
    } as const;
    const init = actionRequestInit(action, context, target);

    expect(actionRequestRoute(action)).toBe("/_emdash/api/plugins/source/.well-known/actions/run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      actionId: "field.summarize",
      context,
      payload: {
        tone: "short",
      },
      target,
      invocationId: expect.any(String),
    });
  });

  it("uses provider runnerRoute and never action route in runner mode", () => {
    const runnerProvider = {
      ...provider,
      runnerRoute: "safe/run",
    } satisfies NormalizedActionProviderConfig;
    const action = {
      id: "cache.clear",
      label: "Clear cache",
      runner: true,
      payload: { scope: "all" },
      provider: runnerProvider,
      route: "unsafe/ignored",
      targetPluginId: "other",
    } as unknown as RunnableAction;

    expect(actionRequestRoute(action)).toBe("/_emdash/api/plugins/source/safe/run");
  });

  it("lets action runner route override provider runnerRoute", () => {
    const runnerProvider = {
      ...provider,
      runnerRoute: "safe/run",
    } satisfies NormalizedActionProviderConfig;
    const action = {
      id: "cache.clear",
      label: "Clear cache",
      runner: { route: "action/run" },
      provider: runnerProvider,
      targetPluginId: "source",
    } as const;

    expect(actionRequestRoute(action)).toBe("/_emdash/api/plugins/source/action/run");
  });

  it("generates a unique invocationId per runner request", () => {
    const action = {
      id: "cache.clear",
      label: "Clear cache",
      runner: true,
      provider,
      targetPluginId: "source",
    } as const;

    const first = JSON.parse(String(actionRequestInit(action, undefined, undefined).body));
    const second = JSON.parse(String(actionRequestInit(action, undefined, undefined).body));

    expect(first.invocationId).toEqual(expect.any(String));
    expect(second.invocationId).toEqual(expect.any(String));
    expect(first.invocationId).not.toBe(second.invocationId);
  });

  it("omits context when the caller has not resolved it", () => {
    expect(
      actionInvocationForAction(
        {
          id: "dashboard.rebuild",
        },
        undefined,
        { kind: "dashboard", surface: "dashboard", type: "dashboard" },
      ),
    ).toEqual({
      actionId: "dashboard.rebuild",
      invocationId: expect.any(String),
      payload: {},
      target: { kind: "dashboard", surface: "dashboard", type: "dashboard" },
    });
  });

  it("treats target metadata as an optional surface requirement", () => {
    expect(actionMatchesTargetRequirement({}, "dashboard")).toBe(true);
    expect(actionMatchesTargetRequirement({ target: { surfaces: ["field"] } }, "field")).toBe(true);
    expect(actionMatchesTargetRequirement({ target: { surfaces: ["field"] } }, "dashboard")).toBe(
      false,
    );
    expect(actionMatchesTargetRequirement({ target: { surfaces: ["field", "row"] } }, "row")).toBe(
      true,
    );
  });

  it("merges form values into payload after defaults", () => {
    const action = {
      id: "field.summarize",
      label: "Summarize",
      payload: { format: "short", tone: "neutral" },
      runner: true,
      provider,
      targetPluginId: "source",
    } as const;
    const init = actionRequestInit(action, undefined, undefined, undefined, {
      format: "long",
    });

    expect(JSON.parse(String(init.body)).payload).toEqual({
      format: "long",
      tone: "neutral",
    });
  });

  it("validates required form fields and target idFrom before submit", () => {
    const form = {
      mode: "inline" as const,
      fields: [
        { name: "prompt", required: true, type: "string" as const },
        { name: "count", default: 1, type: "integer" as const },
      ],
    };

    expect(actionFormInitialValues(form)).toEqual({ count: 1 });
    expect(actionFormValidationError(form, { count: 1 })).toBe("prompt is required.");
    expect(actionFormPayload(form, { count: "2", prompt: "Go" })).toEqual({
      count: 2,
      prompt: "Go",
    });

    expect(
      actionSubmitValidationError(
        { form, target: { idFrom: "entryId", required: true } },
        { kind: "dashboard", surface: "dashboard", type: "dashboard" },
        { prompt: "Go" },
      ),
    ).toBe("Action target entryId is missing.");
  });

  it("keeps field value-key form values in sync with the current field value", () => {
    const form = {
      mode: "inline" as const,
      fields: [
        { name: "value", type: "string" as const },
        { name: "format", type: "string" as const },
      ],
    };
    const values = { format: "short", value: "Previous title" };

    expect(actionFormValuesWithFieldValue(form, values, "value", "Current title")).toEqual({
      format: "short",
      value: "Current title",
    });
    expect(
      actionFormPayload(
        form,
        actionFormValuesWithFieldValue(form, values, "value", "Current title"),
      ),
    ).toEqual({
      format: "short",
      value: "Current title",
    });
    expect(actionFormValuesWithFieldValue(form, values, "missing", "Current title")).toBe(values);
  });
});
