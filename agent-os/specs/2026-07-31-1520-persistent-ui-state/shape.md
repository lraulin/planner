# Persistent UI State + Unified Grid Controls — Shaping Notes

**Status: frozen / complete** (2026-07-31)  
Authoritative as-built detail: `plan.md`.

This is a historical shaping record. Do not treat it as a living control plane; open a
new delta-spec for further work in this area.

## Scope

Make the app remember how you left it, and finish the grid-control story that
`2026-07-28-1121-main-grid-tabs` started.

### In scope (delivered)

- `user_settings` table in Postgres, key/value rows scoped by `(user_id, scope)`
- A settings provider — the app's first React context — with a `localStorage` write mirror
  and a replay queue
- Persisted per tab: column set / order / **widths**, filters, sort, group collapse, sub-view
- Persisted elsewhere: Chooser settings, Notes filter + mode + sort, Outline type filters +
  `focusOnly`, detail-drawer active tab
- **Bug fix:** header sort silently does nothing when grouping is on
- Multi-select column filter values
- Drag-to-resize column widths
- De-duplicated common column definitions (where defs were truly identical)
- Wish List migrated off its hand-rolled grid onto `DataGrid`
- Detail drawers and sub-views in the URL, so reload and Back behave
- Per-grid reset and a global `/settings` reset page

### Out of scope

- Saved named views, a Views & Filters sidebar, a custom filter builder — all listed under
  "Out of roadmap (for now)" (`agent-os/product/roadmap.md`)
- Filters and sort in the URL for sharing
- Adopting existing `localStorage` values into the new store
- Per-device overrides of a server-stored preference
- Cross-tab live sync between two open browser tabs

## Decisions

- **Postgres is the source of truth, `localStorage` is a write mirror.** This supersedes the
  explicit "no user-settings table" calls in `2026-07-28-1121-main-grid-tabs/shape.md:82` and
  `2026-07-30-1858-task-chooser/shape.md:66`. What changed: the persisted set grew from
  "column layout" to "essentially all view state", and losing it on a browser change stopped
  being a fair trade. The frozen folders are not edited; this spec is the record.
- **Key/value rows, not one blob per user.** A write touches one row, two open tabs cannot
  clobber each other through read-modify-write, and a single scope can be reset on its own.
- **Start clean.** Existing `planner.grid.columns.*` and `planner.chooser.settings.*` keys are
  abandoned rather than adopted. Column layouts and scoring weights get re-done once.
- **The mirror is a write queue, not a read cache.** Every page is `force-dynamic`, so the
  server render already delivers correct settings in the first HTML; a read cache would guard
  against a flash that cannot happen.
- **Sorting never fights a manual order.** On Outline, Day and Chooser, an active sort
  disables row drag and shows a clearable chip. Sorting never writes `sortKey`.
- **URL carries drawers and sub-view only.** `push` for drawer open/close so Back closes it;
  `replace` for view switches so history stays clean.
- **`DataGrid` becomes controlled-optional.** New `sort` / `filters` props fall back to the
  existing internal `useState`, so the migration lands tab by tab without a flag day.

## Context

Three findings during exploration changed the shape of the request, which arrived as "add
generic app-wide grid controls":

- Column add / remove / rearrange **already exists** (`useGridColumns` era +
  `ShowFieldsDialog.tsx`) — it needed to move stores and gain widths, not be built.
- Header sort **already exists** on four tabs but was **broken under grouping**.
- Filter state was **private to `DataGrid`**, which is the single fact that blocked
  persistence, a clear-filters button, and shareable state.

- **Visuals:** none. The work is behavioural, against existing UI.
- **References:** see `references.md`.
- **Product alignment:** delivers the Phase 1 "light polish on the main grids" line and
  records that the "no user-settings table" decision is superseded. Serves the mission's
  "own your data" and multi-user-ready posture by putting preferences where the rest of the
  user's data already lives.

## Standards Applied

- `database/migrations` — generated migration; never hand-written
- `development/testing` — pure logic in `src/lib/**` with adjacent tests; mutations
  `*.integration.test.ts` with the cross-user case; no React component tests
- `components/ux-principles` — grid + drawer, inline editing, modals only for confirmations
- `components/modal-pattern` — the reset confirmations
- `components/drawer-pattern` — the detail drawer whose open state moved to the URL
