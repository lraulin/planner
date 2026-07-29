# Standards applied — Weekly Planning Wizard

## `components/ux-principles.md`

- **No modal for Select Week.** Modals are reserved for destructive confirmations and
  genuinely blocking decisions. Achieve's Select Week dialog becomes step 0 of the page.
- **Context preservation.** The wizard is a full page rather than a drawer over the
  calendar, because steps 3 and 5 need the whole week grid; but steps 1, 2 and 4 keep a
  list rail on the left so you always see where you are in the sequence.
- **Keyboard first.** Back/Next are buttons and `Alt+←` / `Alt+→`; step tabs are real
  links; every editable field is reachable by tab order.
- **Allow partial saves.** No step gates the next one. A plan is useful half-finished, and
  Achieve's own wizard lets you jump tabs freely.
- **Rollups stay read-only.** Effort Left on a project row in step 4 is a subtree rollup —
  shown, never editable there. The editable number is the week's commitment.

## `components/drawer-pattern.md`

Step 3 reuses `AppointmentDrawer` unchanged rather than growing a second appointment form.

## `development/testing.md`

- Pure logic in `src/lib/planning/*.ts` with adjacent `*.test.ts`: budget math, block
  splitting, free-slot search, which goals/areas a review step should show.
- `mutations.integration.test.ts` against real Postgres, one fresh user per test, and the
  required cross-user case: a second user must fail to read, change, and delete the first
  user's plan and entries.
- No component tests; the wizard's real logic lives in `src/lib/planning`.
