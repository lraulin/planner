# Standards that apply

**Status: active**

Distilled to the points this spec actually turns on. Read the source files for the rest.

---

## `database/migrations.md`

Three new tables (`contacts`, `contact_items`, `resources`), three new columns on existing
tables (`task_details.contactId`, `notes.contactId`, `time_charts.description`), and two new
enums. That is the most schema this spec touches anywhere, so the whole standard is live.

- **Generated migrations only.** `npm run db:generate` → **read the SQL before trusting it**
  → `npm run db:migrate`. Commit the `.sql`, the `meta/NNNN_snapshot.json` **and** the
  `_journal.json` entry together; they are one change.
- **Never hand-write a migration without regenerating its snapshot.** `db:generate` diffs the
  last snapshot against `schema.ts`; one missing snapshot poisons every migration after it.
  This is not hypothetical — `0004` shipped without one and `0005`–`0008` all had to be
  hand-written as a result.
- **`db:push` is local scratch only.** It produces no migration file, so the files and the
  database silently diverge. The change is not real until `db:generate` has emitted a
  migration.
- **Migrations run over `DIRECT_DATABASE_URL`, never the pooler.** Relevant here because
  `contact_item_kind` seeds four values we do not render yet specifically so no future
  `ALTER TYPE ... ADD VALUE` is needed — that statement is exactly what fails on Neon's
  transaction-mode endpoint.
- **`db:seed` is destructive** — it deletes the dev user's nodes, appointments and time
  charts. Do not reach for it to get test contacts.

---

## `development/testing.md`

- **A test earns its place if it would fail loudly on a plausible mistake.** If breaking the
  code would not break the test, the test is decoration.
- **Pure logic in `src/lib/**` — always**, with `foo.test.ts` beside it. `name.ts`
  (display-name/file-as/initials derivation, `primaryOf`) and `capacity.ts`
  (`weeklyAvailableMinutes`) are precisely the "wrong answer looks plausible" category this
  is aimed at.
- **DB mutations and queries — always, as `*.integration.test.ts`.** Not done until **a
  second user has tried to read, change and delete the first user's row and failed at every
  step.** Both `src/lib/contacts/` and `src/lib/resources/` owe this.
- **No React component tests.** `ContactDrawer`, `ContactItemList` and the grids get none;
  anything in them worth testing gets extracted to `src/lib/**` first.
- **No tests for server actions** — they are thin wrappers; test what they delegate to.
- **Prefer real values over mocks.** Real Postgres, fresh user per test, cleaned up in
  `afterAll` via the `users` cascade. Do not mock Drizzle.
- **`npm run test:unit` passing does not mean the DB tests ran.** They skip loudly when
  Postgres is unreachable. This spec adds a column to `task_details`, and the `TASK_KEYS`
  coverage test that catches a missed allowlist entry lives inside a `describeDb` file —
  **check for the skip warning before trusting green.**

---

## `components/data-grid.md`

Four new grids. The parts that decide things here:

- **"A tab declares what it has — it does not assemble buttons."** Contacts, Resources, Time
  Charts and Result Areas declare columns, switches and group dimensions; `GridToolbar`
  supplies the controls. If a control seems missing, add it to `GridToolbar`, not to one grid.
- **"Filtering, searching and grouping act on _defined_ columns, not visible ones."** The
  Contacts grid defines Job Title and Updated but hides them by default; both must still
  filter and search. Hiding a filtered column silently emptying a grid is a bug this standard
  exists because of.
- **"A view is a collection of settings, never a mode."** The test: _if picking the view is
  the only way to get some behaviour, it is a mode._ "Needs a Conversation" is a legitimate
  view — its filter and its sort are both reachable one at a time from the toolbar.
- **"Every main grid has saved views, through one hook: `useModuleViews`."** Its argument
  order is load-bearing (`useSavedViews` → allow-list → `useTabView` → `useGridState`); get it
  backwards and every saved view is silently rejected.
- **Three-tier toolbar.** Bar / `⋯` overflow / dialog. A toolbar earns its width. Contacts'
  bar holds the view select, filter, group-by and search; Save/Update/Rename/Delete register
  as commands behind `⋯`.
- **"An inherited value that can be grouped by must also be a column."** Company is grouped
  by in the By Company view, so Company is a column.
- **Persistence goes through the `grid:{tabId}` scope.** No component writes `localStorage`
  directly. `grid:contacts.all` and `views:contacts` already parse under the existing
  `KEY_PATTERN` — no change to `src/lib/settings/scopes.ts`.

---

## `components/drawer-pattern.md`

- **Explicit Save that stays open is the default for structured records.** A contact and a
  resource are structured records; this is the model, not autosave. Autosave is for
  document-like surfaces (the note body).
- **Always use `DrawerFooter`** from `src/components/detail/Drawer.tsx`; do not hand-roll the
  footer.
- **Errors are returned, not thrown**, so a rejected save renders inline in the drawer rather
  than blowing up the page.
- **Tabs inside the drawer** — the pattern `FormTabs` implements, and the persisted-tab
  behaviour under the `drawer` settings scope.
- Practical consequence for Contacts: the house `run()` wrapper calls
  `revalidatePath("/", "layout")` after **every** action. A drawer with ~20 fields
  autosaving per keystroke would hammer it. `DraftTextField` / `DraftTextArea` commit on blur,
  plus the explicit Save.

---

## `components/navigation.md`

- **One module registry, five surfaces.** `src/components/shell/modules.ts` is the only place
  a module is described. Never hard-code one in the sidebar, the mobile nav, the More sheet,
  the header title or the palette.
- **Sections render only when they hold a built module.** Promoting Time Charts makes
  `Library` appear for the first time — check it on desktop and phone.
- **Reserved modules render nowhere.** No "coming soon" rows; a menu full of dead entries
  teaches you to stop reading the menu. This is also why `life-plan` gets deleted rather than
  left reserved.
- **One command registry, two renderers**, and **no command is palette-only** — there is no
  `⌘K` on a phone. Each new module needs a `GO_KEYWORDS` entry; the go-to command itself is
  generated from `BUILT_MODULES`.
- **A built module must have an icon** — the collapsed rail is icons only.

> **Note:** this file is stale post-rename. It still says `src/components/shell/views.ts` and
> `sectionsWithViews()`; the real names are `modules.ts` and `sectionsWithModules()`. Fixed at
> freeze (Task 12).
