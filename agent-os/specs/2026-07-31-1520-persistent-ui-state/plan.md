# Persistent UI State + Unified Grid Controls

**Status: active**  
Spec folder: `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

This is a working document. While the spec is active, material changes to requirements,
design, or scope — including feedback on what was actually built — belong in the relevant
section here and in the **Changes from original plan** table. Pure implementation detail
does not.

---

## Context

The app forgets almost everything between sessions. Column layout persists (`localStorage`,
per tab) and Task Chooser weights persist (same), but **filters, sort, sub-view selection,
group collapse, and every open drawer are per-mount `useState`** — switch tabs or reload and
you are back to defaults. Reload while a record is open and the drawer is gone.

Three findings from shaping reshaped the ask, which started as "add generic app-wide grid
controls":

1. **Column add / remove / rearrange already exists** — `src/components/grid/useGridColumns.ts`
   plus `ShowFieldsDialog.tsx`. Not missing; it needs to move onto the new storage rail and
   gain width control.
2. **Click-header-to-sort already exists** on Projects / Tasks / Goals / Notes — but it is
   **silently broken whenever grouping is on**. `DataGrid.tsx:196-213` skips sorting when any
   group header is present, while still drawing the ↑/↓ arrow on the header. A live bug.
3. **Filter state is private to `DataGrid`** (`DataGrid.tsx:122-123`). A host cannot read,
   seed, persist, or clear it. That single fact is what blocks persistence, a "clear filters"
   button, and any shareable state.

So the work is **uniformity, persistence, and a bug fix**, not building grid controls from
scratch.

### Reversal of a documented decision

Two frozen specs deliberately chose `localStorage` and said _no user-settings table_:

- `2026-07-28-1121-main-grid-tabs/shape.md:82` — "Column layout persists to `localStorage`,
  not the database. No schema change and no user-settings table for what is a per-device
  display preference."
- `2026-07-30-1858-task-chooser/shape.md:66` — "Settings in `localStorage`. Same trade
  `useGridColumns` already accepts for column layout."

This spec **supersedes both**. What changed: the set of persisted state grew from "column
layout" to "essentially all view state", and losing it on a browser change stopped being a
fair trade. Those folders are frozen and are not edited; this spec is the record.

## Final decisions

| Decision             | Choice                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Storage              | Postgres is the source of truth; `localStorage` is a write-through mirror                   |
| Table shape          | Key/value rows — `user_settings(user_id, scope, value jsonb)`, unique on `(user_id, scope)` |
| Existing local prefs | **Dropped.** Server defaults win; no adoption or migration path                             |
| URL state            | Detail drawers + sub-view only. Filters / sort / columns stay in the store                  |
| Newly persisted      | Chooser settings, Notes filter, Outline type filters, group collapse, drawer active tab     |
| Grid extras          | De-duplicated column defs, multi-select filter values, resizable column widths              |
| Reset                | Per-grid reset, plus a global `/settings` page                                              |

### Why the mirror is a write queue, not a read cache

Every page is `export const dynamic = "force-dynamic"`, so the server render already ships
the correct settings in the first HTML. A read-path `localStorage` cache would guard against
a flash that cannot happen here. The mirror earns its place on the **write** side instead:
writes land in `localStorage` immediately, flush to the server debounced, and replay on the
next load if a flush failed. Same durability benefit, no redundant read path. (Change #1.)

### Sorting must not fight a manual order

Outline, Day, and Chooser are manually ordered — drag-to-reorder, drag-to-rank, and score
rank respectively. Header sort is still offered there, but as a **non-destructive view**:
while a sort is active, row drag is disabled and a `Sorted by Deadline ↓ — clear` chip shows
above the grid. Sorting never writes `sortKey`.

Without this rule, header-sort on those tabs either does nothing (today's bug) or silently
fights the order the user built by hand.

## Data model

```
user_settings
  id          uuid pk default random
  user_id     uuid not null → users.id on delete cascade
  scope       text not null          -- "grid:tasks", "chooser:tc-priority", "outline:filters"
  value       jsonb not null         -- { v: 1, ... } scope-specific payload
  updated_at  timestamptz not null default now()

  unique (user_id, scope)            -- user_settings_scope_uq
  index  (user_id)                   -- user_settings_user_idx
```

Every payload carries `v: 1`. Unknown, renamed, or wrongly-typed keys are dropped on parse
and never trusted — the same defensive posture as `parseSettings` in
`useChooserSettings.ts:57-108`, which is the model to copy. The blob is user-editable in
devtools and must survive refactors of the types it mirrors.

Scopes:

| Scope              | Payload                                                      |
| ------------------ | ------------------------------------------------------------ |
| `grid:{tabId}`     | `{ v, order, widths, filters, sort, collapsedGroups, view }` |
| `chooser:{viewId}` | existing `ChooserSettings` (`src/lib/chooser/types.ts:22`)   |
| `outline:filters`  | `{ v, types, focusOnly }`                                    |
| `notes:filter`     | `{ v, filter: NoteFilter, mode, sort }`                      |
| `drawer`           | `{ v, tabByType: Record<NodeType, string> }`                 |

## Acceptance criteria

- [ ] Reload any grid: filters, sort, column set / order / widths, group collapse and
      sub-view come back as they were — on a different browser too.
- [ ] Reload with a record open: the drawer reopens on that record. Back closes it.
- [ ] Sorting a **grouped** grid actually reorders rows within each group.
- [ ] A column filter accepts several values at once.
- [ ] Wish List renders through `DataGrid`; no hand-rolled grid remains in the app.
- [ ] Sorting a manually-ordered grid disables drag and shows a clearable chip; `sortKey` is
      never written by a sort.
- [ ] "Reset this grid" and "Reset everything" restore defaults immediately.
- [ ] A second user cannot read, change, or delete the first user's settings row.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all clean.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish
is omitted.

| #   | Change                                                                                                     | Why                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `localStorage` is a write-through mirror and pending-write queue, not a read-path cache                    | Every page is `force-dynamic`, so the server render already delivers correct settings in the first HTML. A read cache would prevent a flash that cannot occur; the durability win is entirely on the write side. |
| 2   | Header sort on manually-ordered grids (Outline, Day, Chooser) disables row drag and shows a clearable chip | Shaping asked for header-sort app-wide, but those grids carry a hand-built order. Sorting them silently would either do nothing (today's bug) or appear to destroy the user's ranking.                           |

## Implementation tasks

### Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`.

### Task 2: Settings persistence rail (server)

- `src/db/schema.ts` — add `userSettings` per the data model above. Then `npm run db:generate`;
  **never hand-write the migration** (`agent-os/standards/database/migrations.md` — one
  missing snapshot poisons every migration after it). Commit `.sql`, snapshot, and journal
  entry together.
- `src/lib/settings/scopes.ts` — scope-id builders (`gridScope(tabId)`, `chooserScope(viewId)`,
  …) and the default payload for each scope. Pure.
- `src/lib/settings/parse.ts` — `parseScopeValue(scope, raw)`: merge stored over defaults,
  discard anything malformed. Pure, and where the tricky reasoning lives.
- `src/lib/settings/queries.ts` — `loadUserSettings(userId)`, one query for all of a user's
  rows.
- `src/lib/settings/mutations.ts` — `writeUserSetting(userId, scope, value)` (upsert on the
  unique index), `resetUserSetting(userId, scope)`, `resetAllUserSettings(userId)`. Each takes
  `userId` first and scopes by it.
- `src/app/settings/actions.ts` — `"use server"` wrappers using the existing `run()` helper
  (`src/app/day/actions.ts:16-22`): resolve the user inside, return `{ ok, error }`.

**Tests.** `parse.test.ts` — malformed JSON, wrong types, renamed keys, missing `v`, and an
explicitly-empty collection honoured rather than silently replaced by the default.
`mutations.integration.test.ts` — round-trip, upsert-not-duplicate, reset, and the mandatory
case where a second user tries to **read, update, and delete** the first user's row and fails
at every step.

### Task 3: Settings provider (client)

- `src/app/layout.tsx` — fetch `loadUserSettings` once and pass the snapshot down. Guard the
  guest case: `getCurrentUserId()` throws when there is no session, and `/login` renders
  through this layout.
- `src/components/settings/SettingsProvider.tsx` — the app's **first** React context (there is
  none today). Holds the snapshot; exposes `useSetting<T>(scope)` returning
  `{ value, update, reset }`. Write path: optimistic local state → `localStorage` mirror →
  debounced server action → replay queue on failure.
- `src/lib/settings/queue.ts` — pure pending-write queue (enqueue, coalesce by scope, drain).
  Unit-tested.

Re-point `useGridColumns.ts` and `useChooserSettings.ts` at `useSetting`, deleting their
`localStorage` internals. Their public hook shapes stay, so call sites barely move. Old
`planner.grid.columns.*` / `planner.chooser.settings.*` keys are abandoned, not migrated.

### Task 4: Lift grid state out of DataGrid

- `DataGrid.tsx` gains optional controlled props — `sort` / `onSortChange` and `filters` /
  `onFiltersChange` — falling back to today's internal `useState` when omitted, so nothing
  breaks mid-migration.
- `src/components/grid/useGridState.ts` — one hook per tab over scope `grid:{tabId}`, owning
  order, widths, filters, sort, collapsedGroups and view. This replaces the **five
  copy-pasted `collapsedGroups` toggle blocks** in Tasks, Projects, Goals, Chooser and
  Outline.
- Toolbar gains "Clear filters" (enabled only when a filter is active) and "Reset this grid".

### Task 5: Fix sort-with-grouping, add multi-select filters

- `src/lib/grid/sortRows.ts` — pure: partition `GridRow[]` into group segments, sort node rows
  **within** each segment, keep headers and depth intact, stable on ties. Replaces the
  `if (groups.length === 0)` skip at `DataGrid.tsx:205`. Tested for grouped, ungrouped, empty
  group, single-row group, and tie stability.
- `ColumnFilter` becomes `{ ids: string[] }` with OR semantics; `["all"]` means inactive.
  Update `matchesFilter` / `rowPassesFilters` in `src/components/grid/filters.ts` and extend
  `filters.test.ts` — a preset mixed with literal values, empty selection, unknown ids staying
  open.
- `ColumnHeader.tsx`'s filter dropdown becomes multi-select (checkboxes; "(All)" clears).

### Task 6: Column widths + de-duplicated column defs

- `buildGridTemplate` (`src/components/grid/columns.ts:62`) accepts a
  `widths?: Record<string, string>` override; a drag handle in `ColumnHeaderRow` writes into
  `grid:{tabId}`. Reset restores the column's declared `width`.
- `src/components/grid/commonColumns.tsx` — factories for `name`, `priority`, `deadline`,
  `effort`, `effortLeft`, `abbrState`, `status`, `tcPriority`. These are currently copy-pasted
  near-verbatim across `outlineColumns.tsx`, `TasksGrid.tsx`, `ProjectsGrid.tsx` and
  `chooserColumns.tsx` (`deadline` appears 4×, `priority` 4×, `abbrState` 3×). Those four
  files consume the factories.

### Task 7: Unify the remaining grids

- **Wish List** — `src/components/tabs/WishesGrid.tsx` (410 lines) re-implements the header
  row, row div, group header, selection, context menu and optimistic patching inline, with a
  literal `gridTemplateColumns` duplicated at lines 168 and 230. Migrate onto `DataGrid` with
  a `WishItem` row payload and a `wishesColumns.tsx`, exactly as Notes did for `NoteNode`.
- Turn on persisted filters everywhere; turn on sort with the drag-disabling chip on Outline,
  Chooser and Day.
- Move Notes' `NoteFilter` + mode/sort and Outline's type filters + `focusOnly` onto
  `useSetting`.
- `NodeDetailDrawer.tsx:147` active tab → scope `drawer`, keyed by node type.

### Task 8: URL state for drawers and sub-views

- `src/lib/url/viewState.ts` — pure encode/decode helpers, modelled on the existing precedent
  `src/lib/fitness/routes.ts` and its `routes.test.ts`. Tested for round-trip, absent params,
  and junk params.
- `?detail=<nodeId>` on Outline, Projects, Tasks, Goals, Wishes, Chooser. The chokepoint is
  `src/components/tabs/useGridTab.ts:29` (`detailId`) for four of them, plus
  `OutlineGrid.tsx:72`.
- `?note=<id>` on Notes currently seeds at mount only (`NotesGrid.tsx:76`) and never clears on
  close — make it fully two-way.
- `?view=<viewId>` for the sub-view pickers (`TasksGrid.tsx:204`, `ProjectsGrid.tsx:300`, Notes
  mode). The stored value supplies the default when the param is absent.
- **History:** `push` for drawer open/close, so Back closes the drawer — the natural gesture.
  `replace` for view switches, to avoid history spam. `useSearchParams` is unused today, so
  add the `<Suspense>` boundaries it requires.

### Task 9: Reset controls

- Per-grid "Reset this grid" in the Show Fields dialog footer and the toolbar (from Task 4).
- New `/settings` route: every scope with a human label, a per-scope "Reset", and "Reset
  everything". The confirm is a destructive-confirmation case — build it on `ModalShell` with
  `role="alertdialog"` per `agent-os/standards/components/modal-pattern.md`.

### Task 10: Verify, freeze spec, update roadmap

Confirm the acceptance criteria, complete **Changes from original plan**, set
`**Status: frozen / complete** (YYYY-MM-DD)` on `plan.md` and `shape.md`, move leftovers to
**Follow-ups**, and update `agent-os/product/roadmap.md` — this delivers the Phase 1 "light
polish on the main grids" line (`roadmap.md:65`) and records that the "no user-settings table"
decision is superseded.

## Verification

1. `npm run db:up`, `npm run db:generate`, `npm run db:migrate`.
2. `npm test` — and **check for the integration-skip warning**. `npm run test:unit` passing
   does not mean the database tests ran; they skip loudly when Postgres is unreachable
   (`src/lib/testing/database.ts`), and this change touches `mutations.ts` and `queries.ts`.
3. `npm run typecheck && npm run lint && npm run build`.
4. Drive it in a browser (the `run-planner` skill): set filters, sort and hide a column on
   `/tasks`, reload → state intact. Open a record, copy the URL, reload → the drawer reopens.
   Group by result area, click a header → rows reorder inside each group. `/settings` → Reset
   everything → `/tasks` is back to defaults.

## Out of scope (this spec)

- Saved named views / a Views & Filters sidebar, and a custom filter builder — both listed
  under "Out of roadmap (for now)" in `agent-os/product/roadmap.md:303`.
- Encoding filters and sort in the URL for sharing. Shaping chose drawers + sub-view only.
- Adopting the existing `localStorage` values into the new store.
- Per-device overrides of a server-stored preference.
- Cross-tab live sync of settings between two open browser tabs.

## Standards applied

- `database/migrations` — generate, never hand-write; direct connection; `db:push` / `db:seed`
  are destructive.
- `development/testing` — real logic in `src/lib/**` with adjacent tests; database work gets
  an `*.integration.test.ts` including the cross-user case; **no React component tests**.
- `components/ux-principles` — grid + drawer, inline editing for grid-visible fields, modals
  only for confirmations.
- `components/modal-pattern` — the `/settings` reset confirm and the Show Fields dialog.
- `components/drawer-pattern` — the detail drawer whose open state moves to the URL.

## Open questions

| Question                                   | Resolution                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Postgres or `localStorage`?                | Postgres, with a `localStorage` write mirror. Supersedes two frozen decisions.                                        |
| One JSON blob per user, or key/value rows? | Key/value rows — a write touches one row, concurrent tabs cannot clobber each other, and a single scope can be reset. |
| Migrate the existing local prefs?          | No. Start clean; column layouts and Chooser weights are re-done once.                                                 |
| How much goes in the URL?                  | Drawers and sub-view only.                                                                                            |
