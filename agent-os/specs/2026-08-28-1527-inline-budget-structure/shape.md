# Inline budget structure, and a bill you can just type in — Shaping Notes

**Status: active**

## Scope

Move envelope and group management out of `BudgetStructureDrawer` and onto the Budget page's
own tables, and make a bill something you can create by typing a name.

- Section headers (Income / Regular spending / Bills / Savings) get `+ Envelope` / `+ Bill` /
  `+ Group`.
- Group header rows get a `+` and a `⋮`.
- Both open a one-line composer under that section's grid, targeted at the group.
- Names rename in place, on rows and on group headers.
- Move up / Move down / Move to group… / Change section / Hide / Delete… become row commands,
  declared in the catalog.
- `createBudgetCategory` stops refusing `kind: 'bill'`; a new bill defaults to monthly and is
  finished in the inspector.
- `BudgetStructureDrawer.tsx` is deleted.

### Out of scope

- Drag-to-reorder on the budget tables — it would force the gutter from checkbox to handle,
  reversing a three-day-old deliberate decision.
- Group `hidden` (column exists, has never had a UI).
- The Register's `Track as bill…` dialog and the Category picker's "New bill…" sentinel.
- `NewEnvelopeDialog` gaining a Bill option.
- De-duplicating the three existing bill field-set forms.

## Decisions

Full statements in `plan.md` D1–D8. The three that shaped everything else:

- **The refusal to create a bill was correct when written and is not any more.** It was
  recorded as `envelope-sections` change row 2 — "creating a bill requires a cadence, which
  the blank-envelope form does not collect." The inspector shipped a month later and collects
  it. So this is a supersession of one named decision, not a reversal of a principle.
- **Create through `createBudgetCategory`, not `upsertBillEnvelope`.** The latter is keyed on
  name so Review can be idempotent; a typed-in bill that collides with an existing name must
  fail or create, never silently edit.
- **The composer is a strip under the grid, not a draft row inside it.** A draft row would be
  sorted, filtered and grouped by the grid the moment it gained a name. This is the only
  place the design departs from the reference screenshots, and it departs deliberately.

### Question the shaping settled

**Should reordering move onto the grid as drag?** No. `DataGrid` requires `gutter: "handle"`
to accept `rowDrag`, and `2026-08-27-2200-plan-gutter-drag-handle` decided three days earlier
that the three Budget tables keep the checkbox and its header select-all. Row commands cost
nothing there and are the only path that works on the phone. The cost — deleting the drawer
removes the budget's only drag — is accepted and recorded in D6 rather than hidden.

## Context

- **Visuals:** `visuals/actual-budget-add-category-and-group.png` (Actual Budget: the `+`
  beside a group header with its "Add category" tooltip, and the "Add group" button under the
  table) and `visuals/ynab-category-group-plus.png` (YNAB: "＋ Category Group" above the
  table and a `+` on the Bills group row). Both are reference apps, not screenshots of this
  app.
- **References:** see `references.md`.
- **Product alignment:** the Finances module's envelope budget is Actual-derived; this spec
  touches only the structure-editing surface, not any budget arithmetic. No roadmap item is
  opened or closed by it beyond Budget-page polish.

## Standards Applied

See `standards.md` for the pinned list. The ones that decided something here:
`components/ux-principles` (inline editing for grid-visible fields; no modal for a routine
create), `components/navigation` (every gesture is a declared command; unavailable is
disabled with the reason), `components/data-grid` (the one shared DataGrid; a new seam is
host-rendered rather than special-cased), `components/responsive` (tappable path for every
gesture), `development/testing` (pure logic beside its test; every mutation gets a
second-user case), `development/clean-code` (fix the model rather than route around it).
