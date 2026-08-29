# Standards for Target Snooze

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d` (2026-08-27, the latest
change to `agent-os/standards/`). Shaped at repo HEAD `a9dc5db539ce09aaaf831314229d1b6db1b7e538`.

**References, not copies** — see `AGENTS.md`. Recover the exact text that applied with
`git show 2920aa76:agent-os/standards/<path>`.

## Applicable standards

- `agent-os/standards/database/migrations.md` — Task 2 adds a column to
  `finance_budget_allocations`; the migration is generated with its snapshot, never hand-written,
  over a direct connection rather than the pooler.
- `agent-os/standards/development/security.md` — `setTargetSnooze` takes `userId` and proves
  ownership before writing. D5's current-month rule and D6/D9's eligibility rules are enforced
  server-side, not merely by disabling a control.
- `agent-os/standards/development/testing.md` — the behaviour change is pure logic in
  `src/lib/**` with tests beside it; the mutation gets an integration test whose cross-user case
  is mandatory. Governs the reminder that `test:unit` passing does not mean the database tests ran.
- `agent-os/standards/development/clean-code.md` — the app → components → lib → db direction, the
  thin `actions.ts` wrapper, and one implementation per concern. Its "when the model is wrong,
  change the model" rule is what selects D1's allocation-row storage over a category column.
- `agent-os/standards/development/dates.md` — `MonthKey` is a calendar month, not an instant; D5's
  current-month check uses `localDateKey(new Date())`, and the suite's pinned timezone matters for
  any test that asserts which month is current.
- `agent-os/standards/components/navigation.md` — a command without a menu is not shipped, so the
  toggle also appears in the Available row menu; an unavailable command is disabled **with a
  reason**, which is exactly how D5, D6 and D9 present themselves.
- `agent-os/standards/components/ux-principles.md` — icon-only affordances carry a title tooltip;
  the Zz in the Available pill follows the existing `FundingIcon` treatment.
- `agent-os/standards/components/data-grid.md` — the budget grid's row menu and cell rendering
  conventions, which the new menu item and the pill icon join rather than work around.
- `agent-os/standards/components/responsive.md` — the budget page is used on the phone, and D10
  routes the same control through the mobile `Drawer` shell; tap targets follow `min-h-tap`.
- `agent-os/standards/development/commits.md` — always applicable: imperative subject naming the
  effect, under 72 characters, not Conventional Commits, with a body explaining why.

## Not applicable

- `agent-os/standards/components/drawer-pattern.md` — the control lands in the inspector's existing
  Target section and the row menu, not in `TargetDrawer`. No new drawer, so no footer/save/
  unsaved-changes contract to honour.

## Deviations

**None from the standards.** The deliberate divergences in this spec are from the _requested
product spec_, not from a standard, and are recorded as `plan.md` D6 (bills excluded), D7
(credit-card payment categories do not exist here), and D8 (no scheduled transactions exist here).
