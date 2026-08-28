# Inline budget structure, and a bill you can just type in

**Status: active**
Spec folder: `agent-os/specs/2026-08-28-1527-inline-budget-structure/`
Standards pinned at: `2920aa766f203439f2136c831f01ccd182c0654d`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — a bill _is_ an envelope: one
  row in `finance_budget_categories`, one table, `kind = 'bill'` plus a nullable facet.
- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — `kind` is the section;
  groups are optional organisational containers at any depth; `group_id` is nullable.
- **Extends:** `agent-os/specs/2026-08-25-1633-budget-inspector/` — bill facet fields
  (cadence, next charge, amount, status, URL) are edited in the inspector, not as columns.
  This spec depends on that being true: it is what lets a blank bill be finished elsewhere.
- **Extends:** `agent-os/specs/2026-08-27-2200-plan-gutter-drag-handle/` — the three Budget
  tables keep the checkbox gutter and the header select-all. See D6.
- **Supersedes:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — **only** its
  **Changes from original plan row 2**: "The structure drawer's section picker is Income /
  Spending / Savings. A bill is still created from Review, not by picking `bill` here …
  Creating a bill requires a cadence, which the blank-envelope form does not collect."
  Everything else in that spec stands.
- **Supersedes:** `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/` — only
  its structure-editing **surface** (the drawer). Its group semantics — arbitrary depth,
  recursive totals, empty-only group delete, groups hold no money — are unchanged and are
  what the new surface edits.

## Context

Two complaints, one cause.

**Managing envelopes and groups is bad.** Everything structural — create, rename, delete,
hide, reorder, move between groups — lives behind one menu command,
`budget.structure.manage` → "Manage groups and envelopes…" (`BudgetView.tsx:645`), which
opens `BudgetStructureDrawer.tsx`: 780 lines of nested cards, a second hand-rolled drag
implementation, and a text input per row. The budget tables themselves are read-plus-assign
only. YNAB and Actual put the gesture where the thing is: a `+` on the group header, a
`+ Category Group` at the top, click the name to rename. Both reference screenshots are in
`visuals/`.

**A bill cannot be created by hand.** `createBudgetCategory` refuses it outright
(`src/lib/finances/budget/mutations.ts:551-553`):

```ts
if (!(ENVELOPE_SECTION_KINDS as readonly string[]).includes(kind)) {
  throw new Error("A bill is created from Review, not as a blank envelope.");
}
```

`ENVELOPE_SECTION_KINDS` (`src/db/schema.ts:2481`) is `["income","spending","savings"]` with
the comment "a bill is created from Review, not this list." `updateBudgetCategory` refuses
switching _into_ `bill` the same way, and `BudgetStructureDrawer.tsx:580-593` renders Bill as
a read-only option (`if (next === "bill") return;`).

That refusal was a recorded decision, and its premise has expired. When
`2026-08-24-0930-envelope-sections` wrote it, a bill's cadence had nowhere to be entered
except the Review form. `2026-08-25-1633-budget-inspector` then shipped an inspector that
edits cadence, next charge, expected amount, status and URL for any selected bill. The
cadence has a home, so the create form does not have to collect it.

The consequence today is that every interactive bill-creation path needs a **transaction**:
the Register `record.track-as-bill` command and its Category-picker "New bill…" sentinel,
the Budget Review drawer, and Insights one-off review. All three funnel into
`trackTransactionAsBill`. A bill that has never charged you — a new subscription, a service
starting next month — has no way in except the agent API (`saveSubscriptionTool` /
`upsertSubscriptionTool`) or the Amazon importer.

**Intended outcome:** the Budget page is the place you manage the budget. `+` on a section
or a group creates an envelope or a bill in it; the name is renamed in place; move, hide and
delete are row commands; and `BudgetStructureDrawer` is deleted.

## Decisions

**D1 — A bill is created like any other envelope, with a monthly default.**
`createBudgetCategory` accepts `kind: "bill"` and stamps the minimum legal facet the
`finance_budget_categories_bill_facet` CHECK requires: `cadenceMonths: 1`,
`status: 'active'`, `scheduled: true`, everything else null. Amount, next charge and real
cadence are then edited in the inspector, which already owns them
(`BudgetInspector.tsx:173-270`).

`updateBudgetCategory` gains the mirror: changing an envelope's section _into_ `bill` stamps
the same default facet. Leaving `bill` already clears it (`budget/mutations.ts:622, 634-646`)
and is unchanged.

**D2 — Creation goes through `createBudgetCategory`, not `upsertBillEnvelope`.**
`upsertBillEnvelope` is keyed on **name** (`src/lib/finances/mutations.ts:776`), deliberately,
so Review can declare idempotently. Using it for a typed-in bill would silently edit an
existing bill whenever the names collide instead of creating one. The inline `+` uses the
ordinary create path; the inspector keeps patching through `setRecurringBillAction` exactly
as it does now.

**D3 — Structure lives on the tables; the drawer is deleted.** `BudgetStructureDrawer.tsx`
and the `budget.structure.manage` command go away. Nothing it did is lost except its
drag-and-drop (see D6). Its section-compatibility filtering for "Move to…" is not lost — it
is extracted to `lib/finances/budget/hierarchy.ts` and reused by the row command, where it
also gains the test it never had.

**D4 — Two affordances create things.** A **section header** gets `+ Envelope` / `+ Bill` /
`+ Group`; a **group header row** gets a `+` and a `⋮`. Both open the same one-line
**composer** rendered directly beneath that section's grid, indented to the target group and
labelled with it ("New bill in Bills"). Autofocused; **Enter creates and stays open** so a
run of envelopes is one gesture each; Escape closes; errors render inline.

The composer is a strip under the grid rather than a synthetic draft row inside it, because
a draft row would be subject to the grid's own sort, filter and grouping and would jump the
moment it gained a name — the exact failure `ux-principles`' "do not move the world while
the user is still typing" names. **This is the one deliberate divergence from the Actual /
YNAB mock in `visuals/`.**

**D5 — Rename is in place.** The name cell swaps to an input when the row is being renamed,
started by double-click or the `Rename` row command; commit on Enter or blur, Escape
reverts — the `ux-principles` inline-edit contract, and the same shape as `TextCell`
(`src/components/grid/cells.tsx:739`). Group headers rename the same way from their `⋮`.

**D6 — Reordering is row commands, not drag.** `Move up` / `Move down` / `Move to group…` in
the row menu and the command catalog, over the existing `moveBudgetStructureItemAction` /
`moveBudgetStructureItemIntoGroupAction`. The three budget tables keep the **checkbox
gutter**: `DataGrid` requires `gutter: "handle"` for `rowDrag`, so grid drag would supersede
`2026-08-27-2200-plan-gutter-drag-handle`'s explicit decision — "Everything else keeps the
checkbox — Register, the three Budget tables, …" — and cost the header select-all. Not worth
it here.

**Known cost, stated plainly:** deleting the drawer removes drag-to-reorder from the budget
entirely. The commands replace it, and unlike the drawer's desktop-only drag they work on
the phone. If drag is wanted later it is a new spec, and it is a gutter decision before it is
a budget one.

**D7 — One new `DataGrid` prop, host-rendered.** `groupChrome?: (header) => ReactNode`,
rendered in the group header's label row after the count. The host renders its own `+` and
`⋮` (and the rename input) and is responsible for `stopPropagation` — the whole header is a
collapse toggle (`DataGrid.tsx:1791`). One generic seam beats two special-purpose props
(`onAddInGroup`, `onRenameGroup`) that only the budget would ever pass.

**D8 — Every new gesture is a declared command.** `navigation.md`: a command without a menu
is not shipped. New page commands under **Organize ▸ Budget**: `budget.envelope.new`,
`budget.bill.new`, `budget.group.new`, `budget.row.rename`, `budget.row.move-up`,
`budget.row.move-down`, `budget.row.move-to-group`, `budget.row.delete`. The existing
hide/show and `budget.review` stay. `budget.structure.manage` is removed.

### Out of scope

- Drag-to-reorder on the budget tables (D6).
- Group `hidden` — the column exists on `finance_category_groups` (`schema.ts:2584`) and has
  never had a UI. It stays that way here.
- The Register's `Track as bill…` dialog and the Category picker's "New bill…" sentinel.
  Prefilling from a real charge is better than a blank bill; both paths stay as they are.
- `NewEnvelopeDialog` (create-from-Register) gaining a Bill option.
- Extracting a shared bill field set from the three near-copies (`ReviewDrawer.ReviewForm`,
  `TrackAsBillDialog.TrackAsBillForm`, `OneOffReview`). This plan adds no fourth copy, so the
  duplication is not made worse and does not need solving here.

## Acceptance criteria

- [ ] `+ Bill` on the Bills section creates a bill from a typed name alone; it appears in the
      Bills table and the inspector shows Monthly with no amount.
- [ ] `+` on a group header creates an envelope inside that group, of that section's kind.
- [ ] Enter in the composer creates and leaves the composer open, focused and empty.
- [ ] Double-click an envelope name renames it in place; Escape reverts; Enter commits.
- [ ] A group header renames in place from its `⋮`.
- [ ] `Move up` / `Move down` / `Move to group…` / `Change section` / `Hide` / `Delete…` all
      work from the row menu on all three tables and from the command catalog.
- [ ] `Move to group…` never offers a destination that would cross a section boundary or nest
      a group inside its own descendant.
- [ ] Deleting a non-empty group is disabled **with the reason**, not absent, and an empty
      one can actually be deleted (needs `2026-08-28-1613-group-kind`; see Changes row 1).
- [ ] `BudgetStructureDrawer.tsx` and `budget.structure.manage` no longer exist; nothing
      references them.
- [ ] Changing an envelope's section to Bills and back leaves a legal row both ways (facet
      stamped, then cleared).
- [ ] The three budget tables still show the checkbox gutter and a working header select-all.
- [ ] Every gesture has a tappable path below `md`.
- [ ] lint, typecheck, `npm test` (unit **and** Postgres integration, no skip warning),
      `next build`, `npm run smoke`.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **A group with no envelopes renders nowhere, so `+ Group` and the empty-only group delete are both unreachable.** Split out as `agent-os/specs/2026-08-28-1613-group-kind/`, which gives `finance_category_groups` a `kind`. This spec is blocked on it. | Found driving Task 6 in a browser: created a bill in a new group, deleted the bill, and the group vanished from the page while surviving in the database. `nestedBudgetGridRows` drops zero-count groups, which was invisible while `BudgetStructureDrawer` listed groups directly — D3 deleted that drawer, so nothing shows an empty group any more. The cause is that a group has no stored section (`groupPageSection` derives it from its members), which is a model correction and gets its own spec per `clean-code.md`. |

---

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`, `visuals/`.

## Task 2: Domain — let a bill be typed in

`src/lib/finances/budget/mutations.ts`

- `createBudgetCategory` takes `kind?: EnvelopeKind`. For `"bill"`, insert with
  `cadenceMonths: 1`, `status: "active"`, `scheduled: true`. Delete the refusal at `:551-553`.
- `BudgetCategoryEdit.kind` widens to `EnvelopeKind`; `updateBudgetCategory` stamps the same
  default facet when moving _into_ `bill`, and keeps its existing clearing when moving out.
- Retire `ENVELOPE_SECTION_KINDS` (`src/db/schema.ts:2481`), or reduce it to whatever still
  genuinely needs the three-value list — it exists to express this refusal. `pageSectionOf`
  (`rows.ts:149`) already maps `bill → spending` and is untouched.
- `createBudgetCategoryAction` / `updateBudgetCategoryAction`
  (`src/app/finances/actions.ts:517, 525`) widen their `kind` parameter.

`src/lib/finances/budget/hierarchy.ts`

- Add `moveDestinations(groups, categories, ref): BudgetGroupRow[]` — the legal "Move to
  group…" set, lifted from `BudgetStructureDrawer`'s `NameEditor` select. Excludes the item's
  own descendants (`descendantGroupIds`) and any group whose `groupPageSection` conflicts
  with the moving item's section.

Tests: `hierarchy.test.ts` for `moveDestinations` (descendant refusal, section refusal);
`budget/mutations.integration.test.ts` for creating a bill (facet CHECK satisfied, monthly),
the spending → bill → spending round-trip, and the mandatory second-user case on each new
path.

## Task 3: Grid seam and the composer

`src/components/grid/DataGrid.tsx` — add
`groupChrome?: (header: Extract<GridRow, { kind: "group" }>) => ReactNode`, threaded to
`GroupHeader` (`:1759`) and rendered in the label row after the `({count})` span. Document
that the host must stop propagation, because the header row is the collapse toggle.

`src/components/finances/budget/StructureComposer.tsx` (new) — one line; target is
`{ section, groupId | null, kind }`; autofocused input; Enter → `createBudgetCategoryAction`
(or `createCategoryGroupAction` for a group), then clear and refocus; Escape closes; inline
error. Indented to the target group's depth and labelled with its name.

`BudgetSection` in `BudgetView.tsx` (`:1496`) gains the section-header buttons and renders
the composer under its grid. `IncomeSection` (`:1558`) is a list, not a grid — it gets the
same `+ Envelope` button and composer.

## Task 4: Inline rename, and structure on the row menu

`budgetColumns.tsx` — `nameColumn` renders an input instead of the text span when
`ctx.renamingId === row.node.id`; commit on Enter/blur via `ctx.onRename`, Escape reverts.
Keep the "rolls over" chip, indicator copy, `FundingBar` and the compact activity link around
it. Double-click on the name starts a rename.

`BudgetView.tsx` — rename `balanceMenu` to something honest (`rowMenuItems`) and append:
`Rename`, `Move up`, `Move down`, `Move to group…` (from `moveDestinations`),
`Change section ▸` (Income / Regular spending / Bills / Savings, current one checked),
`Delete…`. Hide/Show already exists (`:820-826`). Delete reuses `ConfirmDialog` with the
drawer's copy: _"Its transactions remain and return to the backlog."_

Group `⋮` menu (rendered via `groupChrome`, opened through the existing `setMenu`): New
envelope / New bill / New subgroup here, Rename, Move up, Move down, Move to group…, Delete
group — disabled with _"Move every subgroup and envelope out before deleting"_ when
non-empty.

Register all of it as commands per **D8**.

## Task 5: Delete the drawer

Remove `BudgetStructureDrawer.tsx`, its import, its state (`managingStructure`), its mount
(`:1296`) and the `budget.structure.manage` command (`:645`). Update the Savings grid's
`empty` copy (`:1166`), which names the drawer today. Grep for any other reference.

## Task 6: Verify, freeze spec, update roadmap

- Full gate: lint, typecheck, `npm test` (both suites — check for the Postgres skip warning),
  `next build`, and `npm run smoke`, which is mandatory here because `src/app/**` changes.
- Drive `/finances/budget` in a browser (the `run-planner` skill): create a bill by name and
  confirm the inspector reads Monthly; create an envelope inside a group; rename both a row
  and a group; move a row up, down and into another group; confirm an illegal move is not
  offered; confirm a non-empty group's delete is disabled with its reason; confirm the
  checkbox gutter and header select-all still work.
- **Freeze only after the page has been used**, not on the implementer's say-so — the mistake
  `one-budget` made and `envelope-sections` recorded.
- Update `plan.md` / `shape.md` with material drift and fill **Changes from original plan**;
  mark **Status: frozen / complete**; update `agent-os/product/roadmap.md` if this closes a
  listed item.

> **Standing rule:** while this spec is active, material changes to requirements, design or
> scope — including feedback on what was built — go into `plan.md` / `shape.md` and get a row
> in **Changes from original plan**. Pure implementation detail does not.
