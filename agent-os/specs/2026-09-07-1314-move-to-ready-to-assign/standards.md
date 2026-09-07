# Standards for Move money to Ready to Assign

Applied as of standards commit `f77fb5242733057098e074268d6b66a4b1e66b75`.

**References, not copies** — see `AGENTS.md`. Recover the exact text that applied with
`git show f77fb5242733057098e074268d6b66a4b1e66b75:agent-os/standards/<path>`.

## Applicable standards

- `agent-os/standards/development/clean-code.md` — picker extras live in `src/lib/**`;
  one unassign write (already in `operations.ts`); components do not invent a second path.
  Do not stuff Ready to Assign into `EnvelopeCatalog` to save a flag — that is the cheaper
  design given today’s catalog, and it would file as a category.
- `agent-os/standards/development/testing.md` — picker/commit logic in `src/lib` with
  tests beside it. No React component tests. No new mutation, so no new integration suite;
  existing unassign cross-user still has to pass.
- `agent-os/standards/development/security.md` — `unassign` already takes `userId` and
  proves ownership of the source envelope. The sentinel must never pass `requireCategory`.
- `agent-os/standards/components/ux-principles.md` — same Move money dialog; Ready to
  Assign first is YNAB consistency, not a new surface.
- `agent-os/standards/components/modal-pattern.md` — keep `MoveMoneyDialog` on `ModalShell`.
- `agent-os/standards/components/responsive.md` — existing 16px / `min-h-tap` on the
  dialog’s amount and To field.
- `agent-os/standards/development/commits.md` — imperative subject naming the effect,
  Spec trailer, no AI attribution.

## Not applicable

- `agent-os/standards/database/migrations.md` — no schema.
- `agent-os/standards/components/data-grid.md` — destination list is the existing combobox.
- `agent-os/standards/components/drawer-pattern.md` — no drawer.
- `agent-os/standards/development/dates.md` — no date-model change.

## Deviations

None from the standards. Product choice: YNAB destination list (Ready to Assign first),
Actual/our unassign arithmetic (no transfer record).
