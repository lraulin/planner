# Budget inspector — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

Move bill-only fields off the Budget grids into a YNAB-shaped inspector so Regular, Bills,
and Savings share the same four money columns. Desktop: sticky right pane. Phone: full-screen
sheet. Envelopes remain the obligation registry.

### Out of scope

- A separate obligation table
- New target types (weekly, set-aside vs refill rewrite)
- Snooze, amount history, cancel/skip from a red envelope, earmarked savings
- Schema / migrations
- Dashboard, Register
- Replacing Actual templates
- Persisting inspector width
- YNAB filter chips / Auto-Assign duplicated in the pane

## Decisions

- **Option 2 (enriched bill envelopes), already shipped.** Option 1 (separate registry) was
  weighed in the shaping chat and rejected: extra indirection does not pay for a personal
  app. `kind: 'bill'` plus cadence / status / URL / `scheduled` _is_ the registry.
- **Two stacked tables, same columns** — not one unified spending DataGrid. one-budget split
  them after a single grid put six `—` columns on every envelope. Extra columns leaving is
  enough to fix the width mismatch; the section split stays.
- **Inspector is master-detail, Drawer is focused edit.** Reusing `TemplateDrawer` as the
  inspector would cover the list. Phone sheet uses the existing Drawer chrome because that
  is already the compact full-screen pattern.
- **Unscheduled (propane) stays `scheduled: false`.** No new flexible flag. Inspector copy
  says "aim to have ~$X" and never invents a charge date.
- **Price changes stay one envelope.** Update the amount. Amount history is a follow-up.
- **Targets are not rewritten this spec.** Bill cadence and existing `simple` / `by` /
  `remainder` templates remain the ask. The inspector _shows_ them and opens TemplateDrawer
  for Regular/Savings.

## Context

- **Visuals:** `visuals/ynab-inspector-dining-out.jpg` (YNAB web Plan with inspector open
  on Dining out; gitignored). See `visuals/approved-wireframe.md`.
- **References:** See `references.md`.
- **Product alignment:** Not the roadmap Next items (cancel/skip, earmarked savings). This
  is the inspector `funding-indicators` left out of scope, plus the fat Bills table.

## Standards Applied

See `standards.md`.
