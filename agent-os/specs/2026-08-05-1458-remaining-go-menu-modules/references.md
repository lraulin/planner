# References

What to read before writing each part, and what to take from it.

## Achieve Planner source of truth

- `docs/achieve-planner/user-manual.md` — §1.3 lists every Go-menu destination and what each
  tab is for (Contacts §127, File Organizer §131, Resources §133, Time Charts §135, Wish List
  §137). §5.2.1 is the Time Chart Information form. §7.2.7 explains what Resources are
  actually _for_ — the two-stage project-block scheduling algorithm — which is why they ship
  wired to the time budget rather than as a dead list. §10.2 is the Life Plan tab, in one
  sentence, which is the whole argument for dropping it.
- `visuals/` in this folder — the AP forms this spec reimplements. Reference for **what the
  features are**, not for chrome; the UI is ours to improve.

## Reference implementations in this codebase

### `src/components/tabs/WishesGrid.tsx` + `wishesColumns.tsx`

- **Relevance:** the template for the Contacts grid. Wish List is the existing grid whose
  rows are _not_ `OutlineNode` — exactly our case.
- **Take:** the `useModuleViews` → `GridToolbar` → `DataGrid` wiring, the `ColumnDef` array
  shape, and how a non-node row payload flows through.

### `src/lib/metrics/` + `src/app/metrics/` + `src/components/metrics/`

- **Relevance:** the only existing module with its **own table** (not `nodes`, not
  `node_items`) and its own bespoke drawer. Contacts and Resources are the same shape.
- **Take:** the three-tier `queries.ts` → `mutations.ts` → `actions.ts` layering; the `run()`
  wrapper and `ActionResult`; `listMetrics`'s **rows-then-children-then-assemble-in-TS**
  pattern, which `loadContacts` copies deliberately rather than pushing primary-selection
  into SQL; `MetricDrawer`'s explicit-save model and keyboard handling; and
  `mutations.integration.test.ts` as the user-isolation template.
- **Do not** copy `MetricsView`'s hand-rolled `<table>` — it exists because of the
  performance-graph pane, which Contacts does not have.

### `src/components/detail/ItemList.tsx` + `itemKinds.ts`

- **Relevance:** the existing repeating-list editor, driven by one config record over ~24
  kinds. `ContactItemList` is its sibling, not its generalization — see the shape note.
- **Take:** expand-in-place rather than a modal over a modal; ↑/↓ reorder; config-driven
  fields; `DraftTextField` commit-on-blur; the `itemKinds.test.ts` idea of asserting every
  enum value has a config entry.
- **Leave:** per-list CSV import/export, the priority column, sort-cycling headers.

### `src/db/schema.ts` — `appointments` and `google_calendar_links`

- **Relevance:** the externally-synced-table shape that `contacts` copies.
- **Take:** the six nullable `external_*` columns and
  `uniqueIndex(userId, externalSource, externalId).where(external_id is not null)`; and the
  doc-comment convention of naming the **local-only** columns a sync must never touch.
  `contacts` needs that comment written now, while it is cheap.

### `src/db/schema.ts` — `task_details.exerciseId`

- **Relevance:** the exact precedent for `task_details.contactId`. A nullable, task-only FK
  to a standalone catalog table with `on delete set null`, justified in its comment as
  "history lives elsewhere; deleting the task never erases it."

### `src/lib/detail/mutations.ts` (`TASK_KEYS`) + `mutations.integration.test.ts`

- **Relevance:** the hand-written allowlist that is the only gate between a task field and
  the database. Adding `task_details.contactId` without adding `"contactId"` to it typechecks
  perfectly and silently drops the link.
- **Take:** the existing `describe("TASK_KEYS")` test asserts the allowlist covers every
  column via `getTableColumns(taskDetails)` — it will catch the omission, but only when
  Postgres is up.

### `src/lib/google/` — `client.ts`, `mapping.ts`, `mirror.ts`, `sync.ts`

- **Relevance:** not used by this spec, but it is the shape the Contacts sync delta-spec
  will take, and the reason the schema is built the way it is.
- **Take (later):** `getGoogleAccessToken(userId)` is directly reusable — Better Auth owns
  refresh, tokens live in the existing `accounts` table, and adding `contacts.readonly` to
  `GOOGLE_SCOPES` in `src/lib/auth/server.ts` is the entire OAuth change. The
  pure-`mapping`/pure-`mirror`/impure-`sync` split is the structure to copy. Note the client
  is plain `fetch`, deliberately not the `googleapis` package.
- **Known constraint:** the OAuth consent screen is still in _Testing_, so Google expires
  refresh tokens after 7 days.

### `src/lib/capture/mutations.ts` — `ensureInbox`

- **Relevance:** `createDiscussionItem` must parent the new task to the Inbox. A root-level
  task inherits no result-area importance and scores strangely in the Task Chooser — a bug
  that surfaces weeks later as "why is this ranked oddly".

### `src/components/notes/LinkedNotesPanel.tsx`

- **Relevance:** already renders "notes filed against this thing" with a create affordance.
  Contact History reuses it; the only change is widening its `nodeId: string` prop to a
  `{ nodeId } | { contactId }` link passed straight into `createNoteAction`.

### `src/components/schedule/TimeChartEditorView.tsx` + `src/app/schedule/time-chart/[chartId]/page.tsx`

- **Relevance:** Time Charts is nearly free because this already exists. Only a list page is
  missing, plus flipping the editor's `AppShell active` from `"schedule"` to `"time-charts"`.

### `src/lib/planning/budget.ts` + `src/components/planning/TimeBudgetStep.tsx`

- **Relevance:** where Resources plug in. Both files carry a comment saying resources are out
  of scope; both are updated. `weekly_plans.availableMinutes` stays authoritative — the
  resource supplies a number, it does not own it.

## Related specs

- **`agent-os/specs/2026-08-05-0838-navigation-and-command-surface`** (frozen) — the module
  registry and command contract every new module here obeys. It is also where `Library` was
  defined and left deliberately invisible: _"which is what lets `Library` sit here fully
  specified and completely invisible until Time Charts or Resources exists."_ This spec is
  that sentence coming due.
- **`agent-os/specs/2026-08-05-1059-views-across-modules`** (frozen) — `useModuleViews`, the
  `SavedView` codec, and the scope grammar. Read before adding built-in views.
- **`agent-os/specs/2026-07-27-1318-per-type-detail-forms`** (frozen) — the drawer and
  repeating-list patterns, and the source of the `node_items` `contact` / `resource` kinds
  that this spec deliberately does **not** touch.
- **`agent-os/specs/2026-07-31-2046-google-calendar-sync`** (frozen) — the mirror model the
  Contacts sync will follow.
- **`agent-os/specs/2026-07-28-1234-weekly-schedule`** (frozen) — Time Charts as built.

## Product docs

- `agent-os/product/achieve-backlog-notes.md` — its "Explicitly low priority or out" table
  lists **"Contacts, File Organizer, Resources tabs — Resources already out; contacts/files
  are other products."** This spec supersedes that row for Contacts and Resources, and
  confirms it for File Organizer. Update the table at freeze so a future reader is not
  reading a decision that has since been reversed.
- `agent-os/product/roadmap.md` — Phase 1 Achieve MVP; this spec closes it.
