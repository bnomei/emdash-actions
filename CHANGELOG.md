# Changelog

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
