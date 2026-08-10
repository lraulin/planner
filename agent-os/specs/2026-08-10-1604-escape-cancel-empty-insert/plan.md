# Escape cancels empty new grid row

**Status: frozen / complete** (2026-08-10)  
Spec folder: `agent-os/specs/2026-08-10-1604-escape-cancel-empty-insert/`

## Context

In Achieve Planner, inserting a grid row enters insertion mode with a blank row. **Esc
cancels the insert** if the row is still blank, removing it. Once any cell is changed, Esc
no longer cancels (use Delete). Manual: `docs/achieve-planner/user-manual.md` §3.3.1.

This app already creates nodes **immediately** with `name: ""`, then opens the name editor
(`startNaming`). Escape today only ends editing (`setEditingId(null)`), so empty
placeholder rows pile up after accidental Insert or a changed mind.

Product alignment: Achieve grid-insert parity polish on Phase 1 outline / list tabs — not a
new roadmap epic.

## Decisions

| Decision       | Choice                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surfaces       | **Node grids only**: Outline + Tasks / Projects / Goals / Result Areas                                                                                                       |
| Untouched rule | Escape discards only when this is the **first name-edit after create** (`virginInsertId`) **and** the **draft is empty** (trim) **and** the **committed name is still `""`** |
| Blur           | **Keep** the empty row; clear virgin so later F2+Esc does not delete                                                                                                         |
| Persist model  | Keep create-then-name (no draft-row redesign). Cancel = `deleteNodeAction` without confirm                                                                                   |
| Out of scope   | Notes, Resources, Contacts, Day draft (already local), schedule, Wish List create, Enter-to-chain-insert, full multi-cell insertion mode                                     |

**Why draft-empty, not only committed-empty:** Escape after typing "hello" must **not**
delete the row (committed name is still `""` until commit). The editor draft is the user’s
“I typed something” signal.

**Why virgin flag, not “any empty name”:** F2 rename on an older empty placeholder must not
delete on Escape.

## Acceptance criteria

- [x] Create a node via any path that opens naming (toolbar New, Insert / Shift+Insert /
      Ctrl+Insert, Outline sibling/child/top, list-tab create) → Escape **without typing**
      → row is **gone** (deleted, no confirm dialog)
- [x] Same create → type at least one non-space character → Escape → row **remains** with
      empty committed name; edit ends
- [x] Same create → blur / Enter with empty name → row **remains** (italic “New task” etc.)
- [x] F2 / Rename on an existing empty-named row → Escape → does **not** delete
- [x] Selection lands on a sensible neighbor after discard (same idea as explicit Delete)
- [x] Pure discard predicate has unit tests; no React component tests

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change        | Why                                                                              |
| --- | ------------- | -------------------------------------------------------------------------------- |
| 1   | None material | Implemented as shaped: virgin flag + draft-empty discard on Esc; blur keeps row. |

## Task 1: Save Spec Documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Pure discard helper + unit tests

`src/lib/grid/virginInsert.ts` + `virginInsert.test.ts` — `shouldDiscardVirginInsert`.

## Task 3: Harden NameEditor cancel path

Pass draft on cancel; skip blur commit after Escape (`cancelledRef`).

## Task 4: Wire `useGridTab`

Virgin id + cancel/finish for Tasks / Projects / Goals / Result Areas.

## Task 5: Wire OutlineGrid

Same pattern on Outline-local create/edit state.

## Task 6: Verify, freeze spec

Unit tests, manual Escape paths, freeze status, commit.

---

While this spec is **active**, material requirement/design/scope changes update plan/shape
and **Changes from original plan**. Freeze when verified.
