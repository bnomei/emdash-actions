import { apiFetch, parseApiResponse } from "emdash/plugin-utils";
import { throwIfAborted } from "./admin-cancellation";
import {
  asRecord,
  cleanOptionalString,
  decodePathSegment,
  optionalFieldString,
  readPath,
} from "./admin-manifest";
import type { ActionButtonContext, ActionDescriptor } from "./types";

export type FieldContextInput = {
  id?: string;
  label?: string;
  required?: boolean;
  value: unknown;
};

type EntryContextRoute = {
  collection?: string;
  entryId?: string;
  entryLocale?: string | null;
  isNew?: boolean;
};

type EntryContextItem = {
  id?: string;
  slug?: string | null;
  status?: string | null;
  locale?: string | null;
  data?: unknown;
};

type CurrentUserContext = {
  id: string;
  role?: number;
  [key: string]: unknown;
};

export function mergeActionContextPayload(
  payload: Record<string, unknown> | undefined,
  options: Pick<ActionDescriptor, "contextKey" | "contextValueKey">,
  context: ActionButtonContext | undefined,
) {
  const contextKey = optionalFieldString(options.contextKey);
  if (!contextKey) return payload;

  const contextValue = readActionContextValue(options, context);
  return {
    ...payload,
    [contextKey]: contextValue,
  };
}

export function readActionContextValue(
  options: Pick<ActionDescriptor, "contextValueKey">,
  context: ActionButtonContext | undefined,
) {
  if (!context) {
    throw new Error("Action context is not available from this EmDash admin version.");
  }

  const contextValueKey = optionalFieldString(options.contextValueKey);
  if (!contextValueKey) return context;

  const value = readPath(context, contextValueKey);
  if (value === undefined) {
    throw new Error(`Action context value "${contextValueKey}" is missing.`);
  }
  return value;
}

export async function contextForAction(
  action: Pick<ActionDescriptor, "contextKey">,
  providedContext: ActionButtonContext | undefined,
  resolveContext: (signal?: AbortSignal) => Promise<ActionButtonContext>,
  signal?: AbortSignal,
) {
  if (!optionalFieldString(action.contextKey)) return providedContext;
  throwIfAborted(signal);
  return providedContext ?? resolveContext(signal);
}

export async function resolveFieldContext(
  providedContext: ActionButtonContext | undefined,
  input: FieldContextInput,
  signal?: AbortSignal,
): Promise<ActionButtonContext> {
  if (providedContext) return providedContext;

  const route = readEntryContextRoute();
  const [entry, currentUser] = await Promise.all([
    route.collection && route.entryId
      ? fetchEntryContextItem(route.collection, route.entryId, signal)
      : Promise.resolve(null),
    fetchCurrentUserContext(signal),
  ]);

  return compactContext({
    surface: "field",
    collection: route.collection,
    fieldName: fieldNameFromId(input.id),
    fieldLabel: input.label,
    fieldRequired: input.required,
    fieldValue: input.value,
    entryId: route.entryId ?? entry?.id,
    entrySlug: cleanOptionalString(entry?.slug),
    entryStatus: cleanOptionalString(entry?.status),
    entryLocale: route.entryLocale ?? cleanOptionalString(entry?.locale) ?? null,
    isNew: route.isNew,
    entryData: asRecord(entry?.data) ?? undefined,
    currentUser: currentUser ?? undefined,
  });
}

export async function resolveDashboardContext(signal?: AbortSignal): Promise<ActionButtonContext> {
  const currentUser = await fetchCurrentUserContext(signal);
  return compactContext({
    surface: "dashboard",
    currentUser: currentUser ?? undefined,
  });
}

export function readEntryContextRoute(): EntryContextRoute {
  if (typeof window === "undefined") return {};

  const url = new URL(window.location.href);
  const segments = url.pathname.split("/").filter(Boolean).map(decodePathSegment);
  const contentIndex = segments.findIndex(
    (segment, index) => segment === "content" && segments[index - 1] === "admin",
  );
  const index = contentIndex >= 0 ? contentIndex : segments.indexOf("content");
  const collection = index >= 0 ? cleanOptionalString(segments[index + 1]) : undefined;
  const idOrNew = index >= 0 ? cleanOptionalString(segments[index + 2]) : undefined;
  const locale = cleanOptionalString(url.searchParams.get("locale"));

  if (!collection) return {};
  if (idOrNew === "new") {
    return {
      collection,
      entryLocale: locale ?? null,
      isNew: true,
    };
  }

  return {
    collection,
    entryId: idOrNew,
    entryLocale: locale,
    isNew: idOrNew ? false : undefined,
  };
}

async function fetchEntryContextItem(collection: string, entryId: string, signal?: AbortSignal) {
  try {
    const result = await parseApiResponse<{ item?: EntryContextItem }>(
      await apiFetch(
        `/_emdash/api/content/${encodeURIComponent(collection)}/${encodeURIComponent(entryId)}`,
        { signal },
      ),
      "Failed to fetch entry context",
    );
    return result.item ?? null;
  } catch {
    return null;
  }
}

async function fetchCurrentUserContext(signal?: AbortSignal) {
  try {
    const user = await parseApiResponse<unknown>(
      await apiFetch("/_emdash/api/auth/me", { signal }),
      "Failed to fetch current user",
    );
    const record = asRecord(user);
    const id = typeof record?.id === "string" ? record.id : undefined;
    if (!id) return null;
    return record as CurrentUserContext;
  } catch {
    return null;
  }
}

export function fieldNameFromId(id: string | undefined) {
  const prefix = "field-";
  if (!id?.startsWith(prefix)) return undefined;
  return cleanOptionalString(id.slice(prefix.length));
}

function compactContext(context: ActionButtonContext): ActionButtonContext {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) compacted[key] = value;
  }
  return compacted as ActionButtonContext;
}
