# Multi-level Grouping + Category as an Ordinary Property

**Status: frozen / complete (2026-08-04)**  
Spec folder: `agent-os/specs/2026-08-04-1115-grouping-levels-and-category/`

**Delta on** `agent-os/specs/2026-08-04-0924-grid-control-surface/` (frozen), which shipped
the Group by picker one level deep and listed multi-level as a follow-up. Durable rules live
in `agent-os/standards/components/data-grid.md`.

## Context

Two gaps surfaced on first use of the new Group by picker.

**1. Only one level.** `sliceTree`'s `emitGrouped` already nests arbitrarily — the previous
slice simply wired a single select, on the grounds that a second was UI nobody had asked for
yet. Someone asked.

**2. Category was a second-class citizen.** You could _group_ by Category but not see, sort,
filter or search it: there was no `category` column anywhere in the app. The value was
computed twice, by two different rules, in two places — `categoryOf` (Outline) and
`contextFor` (list tabs) — and both special-cased Result Areas, walking up for the nearest
ancestor _of that type_ with a category. So Category behaved unlike every other groupable
field, and nothing showed the value the headers were grouping on.

## Decisions

| Decision                            | Choice                                                                                                  | Why                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inheritance                         | **`effectiveCategory` on `OutlineNode`**, computed in `derive.ts` by the same memoized walk as `lapFor` | One rule, one place. What the column shows is what grouping groups by, and neither can drift.                                                                                                |
| Whose category counts               | **Nearest self-or-ancestor carrying one, regardless of type**                                           | Only Result Areas set one in practice, so behaviour is identical today — but the rule stops being a special case, which is the whole point of "treat it like everything else".               |
| Category column                     | **Read-only, off by default, offered in Show Fields** on Projects / Tasks / Goals / Outline / Chooser   | The value belongs to the Result Area that set it; editing it from a task's row would silently rewrite every sibling under that area.                                                         |
| Levels                              | **Up to 3**, progressive selects (`Group by` … `then by` … `then by`)                                   | Three already nests headers three deep before the first row. Progressive because most grouping is one level, and a row of three `(None)`s reads as a control doing something when it is not. |
| Duplicate dimension                 | **Moves rather than duplicates**                                                                        | Grouping by State inside State is a no-op that looks like a broken control.                                                                                                                  |
| Clearing a level                    | **Truncates the levels below it**                                                                       | There would be nothing left for them to sit under, and the grid would regroup by a dimension the user had not asked for.                                                                     |
| `Groups` / `Group by Area` switches | **Removed**; the arrangement they encoded became the tab's **default grouping**                         | Two controls for one thing, with the older silently winning — `Group by → (None)` on Projects still showed headers.                                                                          |
| `groupBy` shape                     | **Nullable list** (`string[]` or null); null = follow the tab's default                                 | Exactly the `order` distinction. Without it, "the user turned grouping off" is unrepresentable on a tab that groups by default.                                                              |

## Acceptance criteria

All verified in the running app on 2026-08-04.

- [x] Group by shows `Group by` / `then by` / `then by`, each appearing once the one above
      it is set, capped at 3. _(Category → Result Area → State produced correctly nested
      headers with counts `Personal (43)` → `Career (7)` → `In progress (2)`.)_
- [x] Clearing a level truncates the ones below it, and the extra selects disappear.
- [x] A dimension already in use is not offered again at another level; choosing it moves it.
- [x] Projects opens grouped Category → Result Area **shown in the picker**, and
      `Group by → (None)` genuinely ungroups and survives a reload. _(0 headers after
      reload — the bug this fixes.)_
- [x] `Category` appears in Show Fields on the node grids, renders the inherited value on
      rows that do not carry one themselves, and sorts.
- [x] Category is filterable from the funnel and the advanced builder, with the real values
      in the enum picker. _(`Category = Work` → `Showing 3 of 47`.)_
- [x] `Groups` and `Group by Area` switches are gone; `Goals`, `Postponed` and
      `Project's Purpose` remain.

## Changes from original plan

| #   | Change                                                         | Why                                                                                                                                                                          |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Removed the `Groups` and `Group by Area` switches, not planned | Making the picker multi-level turned them into duplicates of it, and the switch won — `(None)` did not mean none. Found by driving the UI, not by reading the code.          |
| 2   | `groupBy` became nullable                                      | Fallout of (1): a tab that groups by default needs "never chose" and "chose nothing" to be different values.                                                                 |
| 3   | `categoryOf(node, byId)` keeps its now-unused `byId` parameter | Every caller has it, and the parameter is what signals this is an ancestry-derived value rather than a field on the row. Removing it is churn across call sites for no gain. |
| 4   | Category added to the **Chooser** too                          | Its rows are nodes and its columns are the shared ones; leaving it out would have re-created the inconsistency one tab down.                                                 |

## Follow-ups (new work — not amendments to this frozen spec)

- **The Outline's `By category` toggle stays a toggle.** Its grouping is genuinely different
  — whole subtrees move under one header (`groupByCategory`) rather than rows being
  regrouped, because on the Outline the tree _is_ the arrangement. Folding it into the
  picker would mean one label with two behaviours. Revisit only with a way to say which.
- Group-by ordering is fixed per dimension (alphabetical for Category, rank order for
  Priority, soonest-first for Deadline). A user-chosen ascending/descending per level has
  not been asked for.
- Nothing writes a category below a Result Area today. The inheritance rule allows it; the
  detail forms would need a field for it to be reachable.
