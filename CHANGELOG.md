# Changelog

## 0.4.0 - 2026-06-20

- Added provider-owned runner actions with `runner: true`, provider
  `runnerRoute`, default `.well-known/actions/run`, and canonical
  `ActionInvocation` requests containing `invocationId`, `actionId`, `payload`,
  `context`, and `target`.
- Added canonical dashboard, entry, field, and row targets plus small target
  metadata for client-side missing-target warnings.
- Added compact inline form metadata and rendering for scalar action inputs,
  with required-field validation and form values merged into action payloads.
- Added scoped reload effects and stale-target conflict semantics for action
  result bodies using `status: 409`, warning severity, and reload effects.
- Preserved direct-route action behavior, legacy manifest route/method actions,
  and legacy input metadata compatibility while documenting runner safety
  requirements and examples.

## 0.3.0 - 2026-06-18

- Added EmDash-shaped `i18n` options with `locale`, `defaultLocale`,
  `locales`, `fallback`, and `messages` for action UI copy.
- Added localized string support for action/provider labels, descriptions,
  confirmations, feedback messages, action patches, and toasts.
- Exported the default action i18n catalog, message keys, and resolver helpers.

## 0.2.5 - 2026-06-18

- Fixed the exported plugin version metadata so EmDash reports the current package version.

## 0.2.4 - 2026-06-16

- Improved the README with a shorter setup flow centered on one backend `ctx`-driven cache action.
- Added focused example recipes for field buttons, dashboard actions, response effects, async jobs, and sandboxed providers.
- Documented where field JSON belongs and how provider backend code runs on the EmDash server.

## 0.2.3 - 2026-06-16

- Fixed terminal feedback button colors so success, error, warning, and info states no longer rely on dynamically emitted important Tailwind classes.
- Switched default terminal feedback to readable Kumo status tint backgrounds with semantic status text and status-colored rings in light and dark mode.
- Added `borderColor` and `darkBorderColor` button style fields for custom feedback borders.

## 0.2.2 - 2026-06-16

- Fixed progress feedback styling so base button colors no longer override Kumo's readable loading and disabled defaults.
- Added `darkColor` and `darkBackgroundColor` button style fields for theme-aware custom button colors.

## 0.2.1 - 2026-06-16

- Fixed progress feedback button styling so running actions defer to Kumo's readable loading and disabled states while terminal success and error feedback keep explicit green and red flashes.

## 0.2.0 - 2026-06-16

- Added stateful action result updates through `result.action`, so a clicked action can update its stable label, icon, tone, description, disabled state, confirmation prompt, or payload after a successful terminal result.
- Added inline progress, success, and error feedback with cooldown reset support for dashboard and field action buttons.
- Added response effects for `clipboard`, `open`, `download`, and `reload`, including top-level aliases and protected provider-route downloads.
- Added `resultEffect` shortcuts so explicitly configured actions can treat primitive string responses as copy, open, or download effects.
- Added Kumo toast support through `toast`, with Janitor-style notification arrays mapped to toasts.
- Documented the action response contracts and maintenance-mode toggle behavior.

## 0.1.0

- Initial action surface plugin.
