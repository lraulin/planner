# Persistent UI State + Unified Grid Controls

**Status: frozen / complete** (2026-07-31)  
Spec folder: `agent-os/specs/2026-07-31-1520-persistent-ui-state/`

This document is the durable record of **what was built and why**. Future work in this
area should open a **new delta-spec** (or a dated change section), not treat this folder as
a living control plane.

---

## Context

The app forgot almost everything between sessions. Column layout and Task Chooser weights
lived in `localStorage`, but **filters, sort, sub-view selection, group collapse, and every
open drawer were per-mount `useState`**. Three findings during shaping reshaped the ask from
"add generic app-wide grid controls" into **uniformity, persistence, and a bug fix**:

1. Column add / remove / rearrange already existed — it needed the new storage rail and
   width control, not a green-field control surface.
2. Header sort existed but was **silently broken under grouping**.
3. Filter state was private to `DataGrid`, which blocked persistence, "clear filters", and
   any shareable state.

### Reversal of a documented decision

Two frozen specs chose `localStorage` and said _no user-settings table_:

- `2026-07-28-1121-main-grid-tabs/shape.md:82`
- `2026-07-30-1858-task-chooser/shape.md:66`

This spec **supersedes both**. Those folders stay frozen; this is the record.

## Final decisions (as built)

| Decision             | Choice                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Storage              | Postgres is the source of truth; `localStorage` is a write-through mirror / pending queue                       |
| Table shape          | Key/value rows — `user_settings(user_id, scope, value jsonb)`, unique on `(user_id, scope)`                     |
| Existing local prefs | **Dropped.** Server defaults win; no adoption path                                                              |
| URL state            | Detail drawers + sub-view only. Filters / sort / columns stay in the store                                      |
| Newly persisted      | Chooser settings, Notes filter + mode/sort, Outline type filters + focusOnly, group collapse, drawer active tab |
| Grid extras          | Shared column factories, multi-select filter values, resizable column widths                                    |
| Reset                | Per-grid reset (toolbar + Show Fields), plus global `/settings`                                                 |
| Manual-order grids   | Header sort is a non-destructive view: drag off + clearable chip; never writes `sortKey`                        |

### Why the mirror is a write queue, not a read cache

Every page is `export const dynamic = "force-dynamic"`, so the server render already ships
the correct settings in the first HTML. Writes land in `localStorage` immediately, flush to
the server debounced, and replay on the next load if a flush failed.

### Grid scope keys

Multi-view tabs key layout **per view** (`grid:tasks.active-status`, `grid:chooser.best-overall`)
so column sets do not fight. The selected sub-view itself lives one level up
(`grid:tasks.view` field on `grid:tasks`). Outline, Notes, Wishes, Day use a single
`grid:{tab}` scope.

## Data model (as built)

```
user_settings
  id          uuid pk default random
  user_id     uuid not null → users.id on delete cascade
  scope       text not null          -- "grid:tasks.active-status", "chooser:tc-priority", …
  value       jsonb not null         -- { v: 1, ... } scope-specific payload
  updated_at  timestamptz not null default now()

  unique (user_id, scope)            -- user_settings_scope_uq
  index  (user_id)                   -- user_settings_user_idx
```

| Scope              | Payload                                                      |
| ------------------ | ------------------------------------------------------------ |
| `grid:{tabId}`     | `{ v, order, widths, filters, sort, collapsedGroups, view }` |
| `chooser:{viewId}` | `ChooserSettings`                                            |
| `outline:filters`  | `{ v, types, focusOnly }`                                    |
| `notes:filter`     | `{ v, filter, mode, sort }`                                  |
| `drawer`           | `{ v, tabByType: Record<NodeType, string> }`                 |

**Code map (entry points):**

| Concern                | Location                                         |
| ---------------------- | ------------------------------------------------ |
| Schema + migration     | `src/db/schema.ts`, `drizzle/0016_*.sql`         |
| Parse / scopes / queue | `src/lib/settings/*`                             |
| Server actions         | `src/app/settings/actions.ts`                    |
| Client store           | `src/components/settings/SettingsProvider.tsx`   |
| Per-grid state         | `src/components/grid/useGridState.ts`            |
| Sort within groups     | `src/lib/grid/sortRows.ts`                       |
| Shared columns         | `src/components/grid/commonColumns.tsx`          |
| URL view state         | `src/lib/url/viewState.ts`, `useViewStateUrl.ts` |
| Global reset UI        | `/settings` → `SettingsPage.tsx`                 |

## Acceptance criteria

- [x] Reload any grid: filters, sort, column set / order / widths, group collapse and
      sub-view come back as they were — on a different browser too. _(Postgres rail +
      layout load in root layout.)_
- [x] Reload with a record open: the drawer reopens on that record. Back closes it.
      _(`?detail=` / `?note=` with push history.)_
- [x] Sorting a **grouped** grid actually reorders rows within each group.
      _(`sortRowsWithinGroups` + unit tests.)_
- [x] A column filter accepts several values at once. _(OR multi-select; `filters.test.ts`.)_
- [x] Wish List renders through `DataGrid`; no hand-rolled grid remains in the app.
- [x] Sorting a manually-ordered grid disables drag and shows a clearable chip; `sortKey` is
      never written by a sort. _(Outline, Day, Chooser, nested Notes.)_
- [x] "Reset this grid" and "Reset everything" restore defaults immediately.
- [x] A second user cannot read, change, or delete the first user's settings row.
      _(`mutations.integration.test.ts` cross-user block — ran green.)_
- [x] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all clean.
      _(907 tests, including settings integration; production build includes `/settings`.)_

## Changes from original plan

| #   | Change                                                                                                     | Why                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `localStorage` is a write-through mirror and pending-write queue, not a read-path cache                    | Every page is `force-dynamic`, so the server render already delivers correct settings in the first HTML. A read cache would prevent a flash that cannot occur; the durability win is entirely on the write side. |
| 2   | Header sort on manually-ordered grids (Outline, Day, Chooser) disables row drag and shows a clearable chip | Shaping asked for header-sort app-wide, but those grids carry a hand-built order. Sorting them silently would either do nothing (today's bug) or appear to destroy the user's ranking.                           |
| 3   | Shared column factories only for truly identical defs (`priority`, `deadline`, `abbrState`, `name`, …)     | `effort`, `status`, `tcPriority` and friends genuinely differ per tab; option-flag factories would be harder to read than the remaining duplication.                                                             |
| 4   | Multi-view grids key `grid:{tab}.{view}` rather than one blob per tab                                      | Tasks/Projects/Chooser views show different columns; one shared layout would fight whichever view you were not looking at.                                                                                       |

## Implementation tasks

All tasks complete (1–10). Historical detail lives in the active-phase plan history and in
git commits on `master` for this feature.

## Follow-ups (new work — not amendments to this frozen spec)

- Browser smoke of the full acceptance walkthrough on a live session if not already driven
  end-to-end after deploy (`run-planner` skill).
- Named saved views / Views & Filters sidebar — still out of roadmap for now.
- Filters/sort in the URL for sharing — explicitly out of this slice.
- Cross-tab live sync of settings between two open browser tabs.
- Per-device overrides of a server-stored preference.
- Further Show Fields UX (selection + multi-move) — still noted under Phase 1 polish.

## Verification (2026-07-31)

1. Integration tests ran (Postgres up) — `src/lib/settings/mutations.integration.test.ts`
   included, no skip warning.
2. `npm test` — 907 passed.
3. `npm run typecheck && npm run lint && npm run build` — clean; `/settings` in route table.

## Out of scope (this spec)

- Saved named views / a Views & Filters sidebar, and a custom filter builder
- Encoding filters and sort in the URL for sharing
- Adopting the existing `localStorage` values into the new store
- Per-device overrides of a server-stored preference
- Cross-tab live sync of settings between two open browser tabs

## Standards applied

- `database/migrations` — generated migration + snapshot + journal
- `development/testing` — pure logic in `src/lib/**`; integration tests with cross-user case;
  no React component tests
- `components/ux-principles` — grid + drawer; modals for confirmations and Show Fields
- `components/modal-pattern` — `/settings` reset-everything confirm (`alertdialog`)
- `components/drawer-pattern` — detail drawer open state in the URL

## Open questions (resolved)

| Question                                   | Resolution                                                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Postgres or `localStorage`?                | Postgres, with a `localStorage` write mirror. Supersedes two frozen decisions.                                        |
| One JSON blob per user, or key/value rows? | Key/value rows — a write touches one row, concurrent tabs cannot clobber each other, and a single scope can be reset. |
| Migrate the existing local prefs?          | No. Start clean; column layouts and Chooser weights are re-done once.                                                 |
| How much goes in the URL?                  | Drawers and sub-view only.                                                                                            |
