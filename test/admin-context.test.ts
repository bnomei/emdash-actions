import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionTargetFromContext,
  contextForAction,
  dashboardActionTarget,
  fieldNameFromId,
  fieldActionTarget,
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

  it("derives dashboard and field action targets without fetching full context", () => {
    vi.stubGlobal("window", {
      location: { href: "http://localhost/admin/content/posts/post-1?locale=de" },
    });

    expect(dashboardActionTarget(undefined)).toEqual({
      kind: "dashboard",
      surface: "dashboard",
      type: "dashboard",
    });
    expect(fieldActionTarget(undefined, { id: "field-title", value: "Hello" })).toEqual({
      collection: "posts",
      entryId: "post-1",
      fieldName: "title",
      locale: "de",
      surface: "field",
      type: "field",
      value: "Hello",
    });
  });

  it("preserves an entry surface target supplied to a field widget", () => {
    expect(
      fieldActionTarget(
        { collection: "posts", entryId: "post-1", entryLocale: "en", surface: "entry" },
        { id: "field-title", value: "Hello" },
      ),
    ).toEqual({
      collection: "posts",
      entryId: "post-1",
      locale: "en",
      surface: "entry",
      type: "entry",
    });
  });

  it("derives targets from compatibility context when provided", () => {
    expect(
      actionTargetFromContext({
        collection: "posts",
        entryId: "post-1",
        entryLocale: "en",
        fieldName: "blocks",
        row: { id: "row-1", text: "Hello" },
        rowPath: "blocks.0",
        rowValue: { text: "Draft" },
        surface: "row",
      }),
    ).toEqual({
      collection: "posts",
      entryId: "post-1",
      fieldName: "blocks",
      locale: "en",
      path: "blocks.0",
      rowId: "row-1",
      surface: "row",
      type: "row",
      value: { text: "Draft" },
    });

    expect(
      actionTargetFromContext({
        collection: "posts",
        entryId: "post-1",
        fieldName: "blocks",
        row: { id: "row-2", text: "Stored" },
        rowPath: "blocks.1",
        surface: "row",
      }),
    ).toEqual({
      collection: "posts",
      entryId: "post-1",
      fieldName: "blocks",
      path: "blocks.1",
      rowId: "row-2",
      surface: "row",
      type: "row",
      value: { id: "row-2", text: "Stored" },
    });
  });
});
