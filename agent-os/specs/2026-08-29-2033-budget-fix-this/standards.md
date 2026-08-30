# Standards for Fix This (negative Ready to Assign)

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. Shaped at repo
HEAD `e0bf007c377334b6915b04696a6a3c9a4eeced06`.

**References, not copies** — see `AGENTS.md`. Recover the exact text that applied with
`git show 2920aa76:agent-os/standards/<path>`.

## Applicable standards

- `agent-os/standards/components/ux-principles.md` — Fix This is a blocking correction
  (modal is allowed). The discoverability fix (verb on the number) is context preservation
  on the summary card: do not hide the action that belongs to the headline figure.
- `agent-os/standards/components/modal-pattern.md` — `FixThisDialog` is a `ModalShell`
  (`role="dialog"`). Unmount on close so the next open starts clean. Phone bottom sheet
  comes from the shell.
- `agent-os/standards/components/responsive.md` — Budget is used on the phone; tap targets
  `min-h-tap`; the 16px input rule on the amount field.
- `agent-os/standards/components/navigation.md` — `budget.fix-this` ships as a Tools
  command, not nested under Assign. Unavailable is disabled with the reason (“Ready to
  Assign is not negative” / “Past months stay historical”), never absent.
- `agent-os/standards/development/testing.md` — clamps and the picker model live in
  `src/lib/**` with tests beside them. The mutation gets an integration test whose
  cross-user case is mandatory. No React component tests.
- `agent-os/standards/development/security.md` — `unassign` takes `userId` and proves
  ownership of the allocation before writing.
- `agent-os/standards/development/clean-code.md` — app → components → lib → db; thin
  `budgetOperationAction`; one implementation of unassign (the pure function), not a
  second path in the dialog.
- `agent-os/standards/development/dates.md` — `MonthKey` is a calendar month; the
  current-vs-past gate uses the same clock as the rest of Budget (`todayKey` /
  `monthKeyOf`).
- `agent-os/standards/development/commits.md` — imperative subject naming the effect,
  Spec trailer, no AI attribution.

## Not applicable

- `agent-os/standards/database/migrations.md` — no schema.
- `agent-os/standards/components/data-grid.md` — the picker is a dialog list, not a
  DataGrid.
- `agent-os/standards/components/drawer-pattern.md` — no drawer.

## Deviations

**None from the standards.** Product divergences from YNAB (no toast, no leftover-from-last-
month chip, our sections instead of “Plan Categories”) are recorded in `plan.md` D3/D6.
