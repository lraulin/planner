# References for Settings workspace and date format preference

**Status: frozen / complete** (2026-08-09)

## External behavior reference

- Microsoft Support, “Format numbers as dates or times” — token vocabulary behind the
  closed date-format preset catalogue:
  https://support.microsoft.com/en-us/excel/format-numbers-as-dates-or-times

## Planner product and standards

- `docs/achieve-planner/README.md` — local Achieve reference precedence.
- `agent-os/standards/development/dates.md` — calendar-day keys versus instants.
- `agent-os/standards/development/clean-code.md` — component/lib/action/database boundaries.
- `agent-os/standards/development/testing.md` — pure logic and cross-user integration gates.
- `agent-os/standards/components/responsive.md` — one `md` breakpoint, 44px controls, safe
  areas, internal scrolling, and dark-mode checks.
- `agent-os/standards/components/ux-principles.md` — progressive disclosure and destructive
  confirmation behavior.
- `agent-os/standards/components/modal-pattern.md` — shared `ConfirmDialog` behavior.

## Existing implementation

- `src/lib/dateFormat.ts` and its callers — fixed short-date policy being replaced.
- `src/components/settings/SettingsProvider.tsx` — server snapshot, optimistic overlay,
  autosave queue, and reset behavior.
- `src/lib/settings/{scopes,queries,mutations,views}.ts` — persisted scope contracts and
  saved-view catalogues.
- `src/components/settings/SettingsPage.tsx`, `src/app/settings/page.tsx` — flat Settings
  surface being reshaped.
- `src/components/detail/ConfirmDialog.tsx` — required bulk-reset confirmation.
- `src/components/shell/modules.ts` — user-facing module vocabulary mirrored by reset groups.
