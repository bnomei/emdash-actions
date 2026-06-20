import { describe, expect, it } from "vitest";
import {
  actionMatchesTargetRequirement,
  actionInvocationForAction,
  actionRequestInit,
  actionRequestRoute,
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
      fieldName: "title",
      value: "Ignored by direct body",
    });

    expect(actionRequestRoute(action)).toBe("/_emdash/api/plugins/source/field/slugify");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ static: true, value: "from-manifest" }));
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
      mode: "runner",
      payload: { tone: "short" },
      provider,
      targetPluginId: "source",
    } as const;

    const target = {
      type: "field",
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
        context,
        tone: "short",
      },
      target,
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
      mode: "runner",
      payload: { scope: "all" },
      provider: runnerProvider,
      route: "unsafe/ignored",
      targetPluginId: "other",
    } as unknown as RunnableAction;

    expect(actionRequestRoute(action)).toBe("/_emdash/api/plugins/source/safe/run");
  });

  it("omits context when the caller has not resolved it", () => {
    expect(
      actionInvocationForAction(
        {
          id: "dashboard.rebuild",
        },
        undefined,
        { type: "dashboard" },
      ),
    ).toEqual({
      actionId: "dashboard.rebuild",
      payload: {},
      target: { type: "dashboard" },
    });
  });

  it("treats target metadata as an optional surface requirement", () => {
    expect(actionMatchesTargetRequirement({}, "dashboard")).toBe(true);
    expect(actionMatchesTargetRequirement({ target: "field" }, "field")).toBe(true);
    expect(actionMatchesTargetRequirement({ target: "field" }, "dashboard")).toBe(false);
    expect(actionMatchesTargetRequirement({ target: ["field", "row"] }, "row")).toBe(true);
  });
});
