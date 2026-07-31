# TC Priority — the Task Chooser's flat ranking

**Status: frozen / complete** (2026-07-30)
Spec folder: `agent-os/specs/2026-07-30-2040-tc-priority/`
**Delta on:** `agent-os/specs/2026-07-30-1858-task-chooser` (frozen) — do not edit that folder.

## Context

The Task Chooser shipped ranking everything by a computed score. It was missing the field
that makes Achieve's To-do List a _to-do list_: a **TC Priority** column, shown in place of
the normal Pri column, holding a second ABCD+rank.

The distinction is the whole point. The outline's priority is **relative to siblings** —
"the second most important task in this project". TC Priority is **relative to everything
you could work on right now** — "the second most important thing today". Those two answers
routinely differ, which is why Achieve stores them separately: its screenshots show items
carrying a normal priority while their TC Priority is still blank.

That makes the To-do List a Franklin Covey–style flat list: one ranking across all
projects, maintained by hand, and _not_ re-sorted underneath you when a deadline moves.

This slice adds the field, the ordering, letter grouping, drag-to-rank with automatic
renumbering, and — added mid-implementation — a per-view **work state filter**.

## Decisions

- **A separate stored field**, `nodes.tc_priority_letter` / `tc_priority_rank`. Sharing the
  existing priority column would mean dragging a row in the chooser silently rewrote the
  outline's sibling ordering.
- **One global ranking**, not one per view. A task's TC Priority is a property of the task,
  so it reads the same wherever the column is shown.
- **Ranks are dense and automatic.** No bare letters here: assigning a letter always places
  the item, so there is always a number. Drop onto A → A1; drop below it → A2; drop above
  A1 → you become A1 and the rest shift down.
- **Every letter gets ranks, D included.** One rule beats a special case, and D-as-unranked
  would have to be explained every time someone looked at it.
- **Compact on the next drag, not on completion.** Completing your A2 leaves A3 as A3 —
  nothing renumbers while you work. The next drop into that letter makes it dense again.
- **Unranked work is shown, below the ranked, ordered by score.** A task captured five
  minutes ago must appear somewhere, or the list quietly goes stale.
- **Work state is a per-view filter**, replacing what began as a single `includeDeferred`
  flag. Completed, Cancelled, and Postponed are off by default everywhere; the To-do List
  additionally defaults to just Not Started + In Progress.

### Out of scope

- Per-view rankings (this one is global)
- Reordering by keyboard (typing the value is the keyboard path)
- Ranking from the Outline or Tasks tab — the column is visible there, editable only here
- Achieve's full column-customisation suite (filter/sort/arrange parity) — noted as wanted,
  deferred to its own slice

## Acceptance criteria

All verified in the running app on 2026-07-30 (`visuals/`).

- [x] `nodes.tc_priority_letter` / `tc_priority_rank` exist via `drizzle/0012_tc_priority.sql`
- [x] The To-do List shows **TC Pri** in place of Pri, drops the Score column, and groups
      rows under A / B / C / D / Unranked
- [x] Every letter header renders even when empty — it is the drop target that puts the
      first item into that letter
- [x] The To-do List orders by TC Priority; unranked work sits below it, ordered by score
- [x] Other views still order by score and still show the outline's Pri
- [x] Typing `A` appends to A; typing `A1` inserts at position 1 and pushes the rest down;
      clearing the cell unranks and closes the gap
- [x] Dragging a row above another renumbers the letter densely; dragging onto an empty
      letter header makes it rank 1; dragging out of a letter compacts what it left
- [x] Ranking survives a reload, and is written in one transaction
- [x] Completed and Cancelled never appear by default in any view, and the state filter is
      editable per view in Settings
- [x] The To-do List defaults to Not Started + In Progress only
- [x] TC Pri is available (off by default) on the Tasks tab via Show Fields
- [x] `npm run test:unit`, `typecheck`, `lint`, `build` pass; DB suites ran

## Changes from original plan

| #   | Change                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Dropped the To-do List's date-based `keep` filter** (focused / started / already-due). The view now shows everything available. | Self-defeating once ranking arrived: you cannot drag a task into your A list if the view hides it until it is already urgent. With the seed data it rendered an empty list with four empty letter headers. Narrowing is the state filter's job now.                                                                                                                                                                                                                                  |
| 2   | **`includeDeferred` replaced by `states: NodeState[]`**, a per-view list covering all nine states.                                | Requested mid-implementation. Two overlapping mechanisms — a hard-coded "never show completed or cancelled" plus one toggle for postponed — meant "why is this row missing?" had two answers and only one was adjustable. Completed and Cancelled are now _offered_ rather than forbidden, and still off everywhere by default: a hidden rule you cannot inspect is worse than a checkbox you will not tick. Achieve's Deferred toolbar toggle survives as a shortcut into the list. |
| 3   | **Repaired `drizzle.__drizzle_migrations`** — three rows' `created_at` disagreed with `_journal.json`.                            | Pre-existing drift, not caused here, but it blocked this migration and would have blocked any other. See **Migration drift** below.                                                                                                                                                                                                                                                                                                                                                  |
| 4   | **Score and rank columns are hidden in the To-do List**, not just reordered.                                                      | The list is ordered by hand; showing a score the ordering ignores invites "why is row 3 above row 2?" with no answer.                                                                                                                                                                                                                                                                                                                                                                |

## Migration drift (worth knowing)

`drizzle-kit migrate` decides what is pending by comparing each journal entry's `when`
against the newest `created_at` in `drizzle.__drizzle_migrations`. Three recorded
timestamps had drifted from the journal:

| migration                    | journal `when` | was recorded as   |
| ---------------------------- | -------------- | ----------------- |
| `0009_acoustic_richard_fisk` | 1785433000000  | 1785429948296     |
| `0010_typical_siren`         | 1785437804798  | 1785437845000     |
| `0011_exercise_equipment`    | 1785438682239  | **1785438682000** |

Because 0011's journal timestamp was 239 ms _newer_ than what was recorded, any new
migration made drizzle re-run 0011 and die on `type "exercise_equipment" already exists`.
`drizzle-kit` swallows that error entirely — it exits 1 with the message erased by its own
spinner — which is why it looked like a silent failure.

Repaired by matching each `drizzle/*.sql` file's SHA-256 against the `hash` column and
setting `created_at` to the journal's `when`. Ten rows already agreed; three were updated.

**This may also be true of production's Neon database**, where the same re-run would fail
the deploy build (`scripts/migrate-on-deploy.mjs`). Worth checking before the next deploy;
the same hash-matched repair applies.

## As-built map

| Area                                                 | Path                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ranking rules (dense renumber, drop/typed placement) | `src/lib/chooser/tcPriority.ts` (+ `.test.ts`)                                                    |
| Persistence + cross-user isolation                   | `src/lib/tree/mutations.ts` → `setTcPriorities`, `src/lib/chooser/tcPriority.integration.test.ts` |
| Server action                                        | `src/app/outline/actions.ts` → `setTcPrioritiesAction`                                            |
| Ordering, letter grouping, state defaults            | `src/lib/chooser/views.ts` (+ `.test.ts`)                                                         |
| Cell                                                 | `src/components/chooser/TcPriorityCell.tsx`                                                       |
| Column + To-do preset                                | `src/components/chooser/chooserColumns.tsx`                                                       |
| Drag wiring                                          | `src/components/chooser/ChooserGrid.tsx`                                                          |
| State filter UI                                      | `src/components/chooser/ChooserSettingsDialog.tsx`                                                |
| Settings shape                                       | `src/lib/chooser/types.ts`, `src/components/chooser/useChooserSettings.ts`                        |
| Schema + migration                                   | `src/db/schema.ts`, `drizzle/0012_tc_priority.sql`                                                |
| Read path                                            | `src/lib/tree/queries.ts`, `types.ts`, `fixtures.ts`                                              |
| Tasks tab column                                     | `src/components/tabs/TasksGrid.tsx`                                                               |

## Follow-ups (new work — not amendments to this frozen spec)

- **Mature column customisation.** The user's stated want: filter / sort / arrange / choose
  at the level of a serious datagrid library, consistently across every tab. The chooser's
  Show Fields is the current stand-in.
- **Keyboard reordering** — move a row up/down within its letter without the mouse.
- **Rank from the Outline / Tasks tab.** The column is read-only there today; making it
  editable means deciding what "insert at A2" means from a view that is not the ranking.
- **Verify production's migration table** before the next deploy (see above).
