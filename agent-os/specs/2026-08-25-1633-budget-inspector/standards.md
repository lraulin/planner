# Standards — budget inspector

**Status: frozen / complete** (2026-08-25)

Canonical standards are referenced rather than copied so this spec does not fork their
instructions. Read these before implementation:

- [`agent-os/standards/components/ux-principles.md`](../../standards/components/ux-principles.md) —
  context preservation while scanning; inspector is master-detail; Drawer stays for focused
  edit of templates, structure, and Review.
- [`agent-os/standards/components/drawer-pattern.md`](../../standards/components/drawer-pattern.md) —
  phone sheet (`100dvh`, Escape, tap-sized close) and the deeper Template/Structure/Review
  drawers.
- [`agent-os/standards/components/data-grid.md`](../../standards/components/data-grid.md) —
  three tables, one column set; no new grid library. Compact row tap already opens detail
  except on `input` / `select` / `button`.
- [`agent-os/standards/components/responsive.md`](../../standards/components/responsive.md) —
  `md` is the split; below it, list → full-screen sheet; 44px tap targets.
- [`agent-os/standards/development/testing.md`](../../standards/development/testing.md) —
  bill-copy / unscheduled mapping in `src/lib/**` with a test; no React component tests.
- [`agent-os/standards/development/clean-code.md`](../../standards/development/clean-code.md) —
  components do not touch the db; reuse `onPatchBill` / `updateBudgetCategoryAction`.
- [`agent-os/standards/development/dates.md`](../../standards/development/dates.md) —
  next charge is a date key; viewed month is a parameter.
- [`agent-os/standards/development/commits.md`](../../standards/development/commits.md) —
  one logical change per commit; Spec trailer to this folder.

Repository-level requirements in [`AGENTS.md`](../../../AGENTS.md) also govern Actual
Budget reference use, spec lifecycle, tests, and smoke verification.
