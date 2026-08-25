# Budget funding indicators — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

YNAB-style scan layer on `/finances/budget`: progress bar under the envelope name, status
copy (Funded / `$X more needed…` / Fully Spent / On Track), and a colored Available pill
with an icon. Regular spending, Bills, and Savings. Numbers do not change.

### Out of scope

- Snooze, weekly target type, credit-card payment icons, YNAB inspector pane
- Optional progress-bar setting
- Dashboard, Register
- Schema changes; deleting `goalCents`
- Guided cancel/skip from a red envelope (roadmap “next”, later spec)

## Decisions

- Full trio, always on. Income stays numbers-only.
- Rename the last money column’s **label** to Available; keep column `id` `balance`.
- Live demand (`neededAssigned`), not stored `goalCents`. Assigned-cell goal rings go away.
- On Track only for `by` templates and yearly/quarterly sinking bills that are on pace.
  Monthly simple templates and bills due this month stay binary.
- Paused / cancelled bills are not an ask. Remainder is not an ask.

## Context

- **Visuals:** `visuals/ynab-category-rows.jpg` (YNAB web category rows; gitignored). See
  `visuals/approved-wireframe.md`.
- **References:** assign-options demand, one-budget tables, month-ahead monthly vs sinking,
  `budgetColumns.tsx` / `rows.ts` `balanceTone` + `goalTone`.
- **Product alignment:** the original envelope-budget scan gap — “each envelope shows how
  funded it is.” Not the cancel/skip follow-up.

## Standards Applied

- ux-principles — scan at a glance; Assigned stays inline-edit
- data-grid — name-cell render only; group headers stay plain
- responsive — compact primary + Available as meta chip
- testing — pure `indicator.ts`; no component tests
- clean-code — one lib function owns the state
- dates — month keys and `nextDueKey` as parameters
