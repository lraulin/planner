# Standards for Assign under Target

**Status: frozen / complete** (2026-09-07)

Applied as of standards commit `f1caf350d015644c5a61f81f78c388f62784a956`.
References, not copies — see AGENTS.md.

- `agent-os/standards/development/clean-code.md` — view-model in `src/lib/**`;
  `BudgetInspector` stays presentation; no second demand function.
- `agent-os/standards/development/testing.md` — unit-test the cents/labels; no
  React component tests; no new mutation so no new integration suite.
- `agent-os/standards/components/ux-principles.md` — inspector is master-detail;
  progressive disclosure (callout only when this month asks).
- `agent-os/standards/components/responsive.md` — 44px tap target on Assign below
  `md`; same inspector in the phone sheet.
- `agent-os/standards/components/navigation.md` — this is not a new command; month-
  bar Assign and the row menu already cover Underfunded.
- `agent-os/standards/development/commits.md` — one logical change; Spec trailer to
  this folder.
- `agent-os/standards/development/dates.md` — `by` is a month key; do not format a
  fake day.

## Deviations

None.
