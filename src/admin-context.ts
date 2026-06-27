/**
 * Action context and target resolution for dashboard and field trigger surfaces.
 *
 * Context may be host-supplied or fetched from EmDash admin APIs; targets
 * compact that context into the {@link ActionTarget} shape sent with invocations.
 */
import { apiFetch, parseApiResponse } from "emdash/plugin-utils";
import { throwIfAborted } from "./admin-cancellation";
import {
  asRecord,
  cleanOptionalString,
  decodePathSegment,
  optionalFieldString,
  readPath,
} from "./admin-manifest";
import type { ActionButtonContext, ActionManifestDescriptor, ActionTarget } from "./types";

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
  options: Pick<ActionManifestDescriptor, "contextKey" | "contextValueKey">,
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
  options: Pick<ActionManifestDescriptor, "contextValueKey">,
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

/** Resolves action context when `contextKey` requires a fresh admin snapshot. */
export async function contextForAction(
  action: Pick<ActionManifestDescriptor, "contextKey">,
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

/** Builds the dashboard invocation target from host context or a default surface. */
export function dashboardActionTarget(context: ActionButtonContext | undefined): ActionTarget {
  return (
    actionTargetFromContext(context) ?? {
      kind: "dashboard",
      surface: "dashboard",
      type: "dashboard",
    }
  );
}

/** Builds the field invocation target, preserving entry/row surfaces from the host. */
export function fieldActionTarget(
  context: ActionButtonContext | undefined,
  input: FieldContextInput,
): ActionTarget {
  const contextTarget = actionTargetFromContext(context);
  if (contextTarget?.type === "field") {
    return compactTarget({
      ...contextTarget,
      value: contextTarget.value !== undefined ? contextTarget.value : input.value,
    });
  }

  if (contextTarget?.type === "row") return contextTarget;
  if (contextTarget?.type === "entry") return contextTarget;

  const route = readEntryContextRoute();
  return compactTarget({
    type: "field",
    surface: "field",
    collection: context?.collection ?? route.collection,
    entryId: context?.entryId ?? route.entryId,
    locale: context?.entryLocale ?? route.entryLocale,
    fieldName: context?.fieldName ?? fieldNameFromId(input.id),
    kind: context?.kind ?? context?.fieldKind,
    value: context?.fieldValue !== undefined ? context.fieldValue : input.value,
  });
}

export function actionTargetFromContext(
  context: ActionButtonContext | undefined,
): ActionTarget | undefined {
  if (!context) return undefined;

  if (context.surface === "dashboard") {
    return {
      type: "dashboard",
      surface: "dashboard",
      kind: context.kind ?? "dashboard",
    };
  }
  if (context.surface === "entry") {
    if (!context.collection || !context.entryId) return undefined;
    return compactTarget({
      type: "entry",
      surface: "entry",
      collection: context.collection,
      entryId: context.entryId,
      locale: context.entryLocale,
      kind: context.kind,
    });
  }
  if (context.surface === "row") {
    const row = asRecord(context.row);
    const value =
      context.rowValue !== undefined
        ? context.rowValue
        : row !== null
          ? row
          : context.fieldValue !== undefined
            ? context.fieldValue
            : context.value;
    return compactTarget({
      type: "row",
      surface: "row",
      collection: context.collection,
      entryId: context.entryId,
      locale: context.entryLocale,
      fieldName: context.fieldName,
      kind: context.kind ?? context.fieldKind,
      rowId:
        cleanOptionalString(context.rowId) ??
        cleanOptionalString(readPath(row, "id")) ??
        cleanOptionalString(readPath(value, "id")),
      path:
        cleanOptionalString(context.path) ??
        cleanOptionalString(context.rowPath) ??
        cleanOptionalString(context.fieldName) ??
        "",
      value,
    });
  }

  return compactTarget({
    type: "field",
    surface: "field",
    collection: context.collection,
    entryId: context.entryId,
    locale: context.entryLocale,
    fieldName: context.fieldName,
    kind: context.kind ?? context.fieldKind,
    value: context.fieldValue,
  });
}

/** Derives collection, entry id, and locale from the current admin URL path. */
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

function compactTarget<TTarget extends ActionTarget>(target: TTarget): TTarget {
  const compacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(target)) {
    if (value !== undefined) compacted[key] = value;
  }
  return compacted as TTarget;
}
