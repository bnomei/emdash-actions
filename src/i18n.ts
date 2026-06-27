/**
 * Locale resolution and message lookup for action labels, feedback, and admin copy.
 *
 * Strings may be plain text or locale maps; resolution walks the configured
 * fallback chain before falling back to English defaults in {@link DEFAULT_ACTIONS_I18N}.
 */
export type LocalizedString = string | Record<string, string | undefined>;

export type ActionsMessageKey =
  | "actionButton"
  | "actionFailed"
  | "actionFinished"
  | "actionRunning"
  | "actions"
  | "copiedToClipboard"
  | "copy"
  | "failedToLoadActions"
  | "failedToPollAction"
  | "failedToRunAction"
  | "loadingActions"
  | "noActionsConfiguredDescription"
  | "noActionsConfiguredTitle"
  | "runAction"
  | "statusAccepted"
  | "statusCancelled"
  | "statusFailed"
  | "statusFinished"
  | "statusQueued"
  | "statusRunning";

export type ActionsI18nMessages = Partial<
  Record<string, Partial<Record<ActionsMessageKey, string | undefined>>>
>;

export type ActionsI18nConfig = {
  locale?: string;
  defaultLocale?: string;
  locales?: string[];
  fallback?: Record<string, string>;
  messages?: ActionsI18nMessages;
};

export const DEFAULT_LOCALE = "en";

export const DEFAULT_ACTIONS_I18N = {
  defaultLocale: DEFAULT_LOCALE,
  locales: [DEFAULT_LOCALE],
  messages: {
    en: {
      actionButton: "Action Button",
      actionFailed: "{action} failed.",
      actionFinished: "{action} finished.",
      actionRunning: "{action} is running.",
      actions: "Actions",
      copiedToClipboard: "Copied to clipboard.",
      copy: "Copy",
      failedToLoadActions: "Failed to load actions",
      failedToPollAction: "Failed to poll {action}",
      failedToRunAction: "Failed to run {action}",
      loadingActions: "Loading actions...",
      noActionsConfiguredDescription: "Configure at least one provider to show action buttons.",
      noActionsConfiguredTitle: "No actions configured",
      runAction: "Run action",
      statusAccepted: "Accepted",
      statusCancelled: "Cancelled",
      statusFailed: "Failed",
      statusFinished: "Finished",
      statusQueued: "Queued",
      statusRunning: "Running",
    },
  },
} satisfies {
  defaultLocale: string;
  locales: string[];
  messages: Record<typeof DEFAULT_LOCALE, Record<ActionsMessageKey, string>>;
};

export function normalizeLocale(locale: string | null | undefined): string {
  return (locale ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE;
}

/** Ordered locale chain used by {@link localizedString} and {@link actionMessage}. */
export function localeFallbacks(i18n: ActionsI18nConfig | string | null | undefined): string[] {
  const config = typeof i18n === "string" ? { locale: i18n } : (i18n ?? {});
  const defaultLocale = normalizeLocale(config.defaultLocale ?? DEFAULT_ACTIONS_I18N.defaultLocale);
  const startLocale = normalizeLocale(config.locale ?? defaultLocale);
  const chain: string[] = [startLocale];
  const visited = new Set(chain);
  let current = startLocale;

  while (config.fallback?.[current]) {
    const next = config.fallback[current];
    if (!next || visited.has(next)) break;
    chain.push(next);
    visited.add(next);
    current = next;
  }

  if (!visited.has(defaultLocale)) {
    chain.push(defaultLocale);
  }

  return chain;
}

/** Resolves a localized string or locale map using the active i18n fallback chain. */
export function localizedString(
  value: LocalizedString | null | undefined,
  i18n: ActionsI18nConfig | string | null | undefined,
  fallback = "",
): string {
  if (typeof value === "string") return value;
  if (!value) return fallback;

  for (const candidate of localeFallbacks(i18n)) {
    const translated = value[candidate];
    if (typeof translated === "string" && translated.length > 0) return translated;
  }

  const source = value[DEFAULT_LOCALE];
  if (typeof source === "string" && source.length > 0) return source;

  const first = Object.values(value).find(
    (translated): translated is string => typeof translated === "string" && translated.length > 0,
  );
  return first ?? fallback;
}

/** Looks up a built-in admin message key with optional per-locale overrides. */
export function actionMessage(
  key: ActionsMessageKey,
  i18n: ActionsI18nConfig | string | null | undefined,
): string {
  const config = typeof i18n === "string" ? { locale: i18n } : (i18n ?? {});

  for (const locale of localeFallbacks(config)) {
    const override = config.messages?.[locale]?.[key];
    if (typeof override === "string" && override.length > 0) return override;

    const defaultMessage = DEFAULT_ACTIONS_I18N.messages.en[key];
    if (locale === DEFAULT_LOCALE && defaultMessage) return defaultMessage;
  }

  const sourceOverride = config.messages?.[DEFAULT_LOCALE]?.[key];
  if (typeof sourceOverride === "string" && sourceOverride.length > 0) return sourceOverride;

  return DEFAULT_ACTIONS_I18N.messages.en[key] ?? key;
}

export function formatActionMessage(
  key: ActionsMessageKey,
  i18n: ActionsI18nConfig | string | null | undefined,
  replacements: Record<string, string | number>,
): string {
  return actionMessage(key, i18n).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
    const replacement = replacements[name];
    return replacement === undefined ? match : String(replacement);
  });
}
