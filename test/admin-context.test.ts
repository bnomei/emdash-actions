import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contextForAction,
  fieldNameFromId,
  mergeActionContextPayload,
  readActionContextValue,
  readEntryContextRoute,
} from "../src/admin-context";
import type { ActionButtonContext } from "../src/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin context and route helpers", () => {
  it("parses admin content routes and locale query parameters", () => {
    vi.stubGlobal("window", {
      location: { href: "http://localhost/admin/content/posts/post-1?locale=de" },
    });

    expect(readEntryContextRoute()).toEqual({
      collection: "posts",
      entryId: "post-1",
      entryLocale: "de",
      isNew: false,
    });
  });

  it("parses new-entry content routes and field names", () => {
    vi.stubGlobal("window", {
      location: { href: "http://localhost/content/articles/new" },
    });

    expect(readEntryContextRoute()).toEqual({
      collection: "articles",
      entryLocale: null,
      isNew: true,
    });
    expect(fieldNameFromId("field-title")).toBe("title");
    expect(fieldNameFromId("title")).toBeUndefined();
  });

  it("merges selected context values into action payloads", () => {
    const context: ActionButtonContext = {
      currentUser: { id: "user-1" },
      entryId: "post-1",
      fieldValue: { slug: "hello" },
      surface: "field",
    };

    expect(readActionContextValue({ contextValueKey: "fieldValue.slug" }, context)).toBe("hello");
    expect(
      mergeActionContextPayload(
        { existing: true },
        { contextKey: "entrySlug", contextValueKey: "fieldValue.slug" },
        context,
      ),
    ).toEqual({
      entrySlug: "hello",
      existing: true,
    });
    expect(() =>
      readActionContextValue({ contextValueKey: "fieldValue.missing" }, context),
    ).toThrow(/is missing/);
  });

  it("resolves context lazily only when an action requests it", async () => {
    const resolveContext = vi.fn(async () => ({ surface: "dashboard" as const }));

    await expect(contextForAction({}, undefined, resolveContext)).resolves.toBeUndefined();
    expect(resolveContext).not.toHaveBeenCalled();

    await expect(
      contextForAction({ contextKey: "context" }, undefined, resolveContext),
    ).resolves.toEqual({
      surface: "dashboard",
    });
  });
});
