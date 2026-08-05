# Remaining Go-menu modules — Contacts, Resources, Time Charts, Result Areas

**Status: active**
Spec folder: `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/`

## Context

The app is close to Achieve Planner parity. Achieve reached sixteen destinations through its
**Go** menu; we've built eleven of them. `src/components/shell/modules.ts` already reserves
the rest — and the `Library` section it defined has never rendered, because
`sectionsWithModules()` hides a section with no built modules.

Five AP destinations remain. Two are dropped permanently:

- **File Organizer** — records standing in for paper files. We have no file storage, so
  there are no files to organize.
- **Life Plan** — a single free-form document. A note already is that, with a better editor.

Three get built, plus **Result Areas**, which is also a reserved AP Go-menu destination:

- **Time Charts** — nearly free. The tables, queries, mutations and the full editor already
  exist; only a list page is missing.
- **Result Areas** — a node grid filtered to `result_area`, the same shape as `/goals`.
- **Resources** — AP's scheduler inputs. Automated scheduling is out of scope, so this ships
  as the weekly wizard's time budget instead of a dead reference list.
- **Contacts** — the substantial one. A real address book, field-shaped so a later Google
  People API sync needs no migration.

The intended outcome: the Go menu is finished, `Library` renders, and every AP section we
mean to have exists.

## Decisions

### Settled with the user during shaping

| #   | Decision                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Contacts get their own top-level table**, shaped to the Google People API so a later sync is a delta-spec with no migration. Include the `external_*` columns now. **No Google API calls in this spec.**                                                                                                                                       |
| 2   | **Discussion Items are tasks.** A nullable `contactId` on `task_details` makes a discussion item a real task that flows into Task Chooser, Day and deadlines — an improvement on AP, where the list was a dead end.                                                                                                                              |
| 3   | **Contact History is notes.** A nullable `contactId` on `notes`. Notes already have title, markdown, date, contexts and flags; that _is_ a log entry.                                                                                                                                                                                            |
| 4   | **Drop AP's Details grid** (CustomerId, Language, Hobbies, Referred By, Spouse, Children, Profession) and the Important Dates list. Google's `userDefined` / `relations` / `birthdays` cover them better. Keep `contexts` + free-text notes. Department survives as a column because `organizations[].department` is a first-class People field. |
| 5   | **Resources feed the weekly wizard's time budget** now, with the full AP field set stored so a future automated-scheduling spec needs no migration.                                                                                                                                                                                              |
| 6   | File Organizer and Life Plan are **out indefinitely** — remove them from `MODULES` rather than leaving dead reservations.                                                                                                                                                                                                                        |

### Design decisions made during shaping

- **Contact sub-records are one child table, not four and not JSONB.** `jsonb` appears
  exactly once in `src/db/schema.ts` (`user_settings.value`), with a doc comment explaining
  it is deliberately non-authoritative. Phones, emails, addresses and URLs share the shape
  `(label, value, primary, notes)` — the same argument `node_item_kind`'s own comment makes.
  A partial unique index makes "one primary per kind" a database fact rather than an
  application hope, and the grid needs to filter on primary phone/email.
- **`contactId` goes on `task_details`, not `nodes`.** `nodes` is loaded whole by
  `loadOutline`'s recursive CTE on every page. `task_details.exerciseId` is the exact
  precedent: a nullable task-only FK to a standalone catalog with `on delete set null`. It
  also means `saveNodeDetail` accepts it for free.
- **Deleting a contact never deletes work.** `task_details.contactId` and `notes.contactId`
  are `set null`; `contact_items` cascade.
- **Contacts gets a real `DataGrid`**, copying `WishesGrid` (non-node payload), not
  `MetricsView` (hand-rolled table for a graph pane it doesn't need).
- **`ItemList.tsx` is not generalized.** It is 524 lines welded to `NodeItem`, and half of
  what it does is wrong for contacts (CSV per list, priority column, no concept of a primary
  radio). A ~150-line `ContactItemList` borrows its good ideas. Generalize when a third
  caller appears, not before.
- **Achieve's three "type"-ish fields stay three fields.** Discussion-item Type maps to
  nothing we have (dropped); discussion-item Context is the _task's_ `contexts`; the
  contact's `contexts` are the contact's.

## Acceptance criteria

- [ ] `Library` renders in the sidebar and the More sheet with Time Charts, Resources and
      Contacts; `Result Areas` renders under Plan. All four reachable from `⌘K`.
- [ ] `/time-charts` lists charts with Name + Description, opens the existing editor, and
      creates/renames/deletes. The editor breadcrumbs to Time Charts, not Schedule.
- [ ] `/result-areas` lists result areas with the standard grid controls and opens the
      existing Result Area drawer.
- [ ] `/contacts` lists contacts with primary phone/email/city, filters and groups, and has
      a "Needs a Conversation" built-in view driven by open discussion items.
- [ ] A contact drawer edits name parts, org, group, birthday, contexts, notes, and the four
      repeating lists; exactly one primary per kind is enforceable only one way.
- [ ] Creating a discussion item from a contact produces a task in the Inbox that appears in
      the Task Chooser; the Task drawer shows and edits its Contact.
- [ ] A note can be filed against a contact and appears in the contact's History.
- [ ] Deleting a contact leaves its discussion tasks and notes intact with null links.
- [ ] `/resources` lists resources; the weekly wizard's time-budget step offers the selected
      resource's weekly hours and the user can still override.
- [ ] `File Organizer` and `Life Plan` appear nowhere, including `MODULES`.
- [ ] `npm run test:unit` passes with the DB up (check for the skip warning), `npm run lint`,
      `npx tsc --noEmit`, and `npm run build` all clean.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-05-1458-remaining-go-menu-modules/` with `plan.md` (this
plan, **Status: active**, with the empty **Changes from original plan** table), `shape.md`,
`standards.md`, `references.md`, and `visuals/` holding the AP screenshots from
`screenshots/contacts_etc/` (the four Contact form tabs, Contact History form, Discussion
Item dialog, Resources list + Resource Information form, Time Charts list, Wish List).

Standards to pull into `standards.md`: `database/migrations.md`,
`development/testing.md`, `components/data-grid.md`, `components/drawer-pattern.md`,
`components/navigation.md`.

Also note in `references.md` that `agent-os/product/achieve-backlog-notes.md` lists
"Contacts, File Organizer, Resources tabs" as out of scope — this spec supersedes that row
for three of the four, and confirms File Organizer.

## Task 2: Time Charts module

Smallest end-to-end proof of the promote-a-reserved-module path, and it makes `Library`
render for the first time.

- Schema: add `description text not null default ''` to `time_charts` (AP's General tab has
  it; the list screenshot shows a Description column). Generate + migrate.
- `src/lib/schedule/queries.ts` — `listTimeCharts(userId)` returning name, description, area
  count, updatedAt.
- `src/app/time-charts/{page.tsx,actions.ts}` — mirror `src/app/metrics/page.tsx`.
- `src/components/schedule/TimeChartsView.tsx` + `timeChartsColumns.tsx` — `DataGrid` +
  `GridToolbar` + `useModuleViews({ moduleId: "time-charts", … })`. Row opens
  `/schedule/time-chart/[chartId]`. Create / rename / delete via the existing mutations.
- `src/app/schedule/time-chart/[chartId]/page.tsx` — switch `AppShell active` from
  `"schedule"` to `"time-charts"`.
- Shell: flip `time-charts` to `built` in `modules.ts`, add `TimeChartsIcon` to
  `navIcons.tsx`, add a `GO_KEYWORDS` entry.
- **Check the one-module `Library` section on desktop and phone before moving on.**

## Task 3: Result Areas module

- `src/app/result-areas/{page.tsx,actions.ts}` and
  `src/components/tabs/ResultAreasGrid.tsx` + `resultAreasColumns.tsx`, following whichever
  of `/goals` or `/projects` is the closest existing filtered-node grid (read
  `src/components/tabs/useGridTab.ts` first — the node grids share it).
- Opens the existing Result Area drawer via `?detail=`.
- Shell wiring as above.

## Task 4: Contacts — schema and links

One migration, generated and committed with its snapshot and journal per
`agent-os/standards/database/migrations.md`.

**`contactItemKindEnum`** — `phone`, `email`, `address`, `url`, then `relation`, `event`,
`im`, `user_defined` seeded but unrendered, so a later sync lands People's `relations`,
`events`, `imClients` and `userDefined` without `ALTER TYPE` on a live enum.

**`contacts`** — name parts (`namePrefix`, `givenName`, `middleName`, `familyName`,
`nameSuffix`, `nickname`, `initials`, `fileAs`), org (`company`, `jobTitle`, `department`),
flattened relations (`managerName`, `assistantName`), `groupName`, birthday as three
nullable smallints (People's `year` is genuinely optional — a `date` column cannot say
that), `photoUrl`, `notes`, `contexts text[]`, the six `external_*` columns with
`uniqueIndex(userId, externalSource, externalId).where(external_id is not null)` copied from
`appointments`, plus CHECK constraints that month and day are present together and in range.
No `sortKey` — the list is ordered by file-as, not by hand.

**`contact_items`** — `contactId` (cascade), `kind`, `sortKey`, `label`, `value`,
`displayName`, `isPrimary`, `notes`, and the eight address-part columns (null on other
kinds, the same sparseness `node_items` already accepts). Indexes:
`(userId, contactId, kind, sortKey)`, a sibling-sortKey unique, and
`uniqueIndex(userId, contactId, kind).where(is_primary)`.

**Link columns** — `task_details.contactId` and `notes.contactId`, both `set null`, plus
`notes_user_contact_idx`.

**Schema doc comments must record two rules while they're cheap:**

1. The **local-only set** a future sync must never write or clear: `contacts.contexts`,
   `contact_items.notes`, `task_details.contactId`, `notes.contactId`,
   `contacts.externalSeriesId` (no People analogue; carried for shape parity with
   `appointments`), and `externalCalendarId` (repurposed for `connections` vs
   `otherContacts`).
2. The **sub-item reconciliation rule**: People sub-fields have no stable id, so the naive
   sync is delete-all-and-reinsert, which silently eats local `notes` and `sortKey` on every
   row. Match by `(kind, normalized value)`, carry `notes` and `sortKey` forward from the
   matched local row, insert/delete only the difference.
3. The `notes` ↔ `biographies` rule: Google wins only when `external_updated_at` is strictly
   newer than `updated_at`, and never on a blank remote value.

**Downstream edits this forces:**

- `src/lib/detail/mutations.ts` — add `"contactId"` to `TASK_KEYS`. Not optional: the
  allowlist is the only gate between a task field and the database, and
  `src/lib/detail/mutations.integration.test.ts` asserts it covers every `task_details`
  column. Skipping it typechecks perfectly and drops the link silently — and the test only
  catches it **when Postgres is reachable**, so don't trust a green run with the DB down.
- `src/lib/notes/mutations.ts` — `NoteInput.contactId`, handled exactly as `nodeId` is.
- `src/lib/notes/queries.ts` — `n.contact_id` in both CTE arms and the final select;
  `loadNotesForContact(userId, contactId)` beside `loadNotesForNode`.
- `src/lib/tree/{queries,types,fixtures}.ts` — `td.contact_id` → `OutlineRow.contactId`, so
  the Tasks grid can show a Contact column. Resolve the _name_ client-side from a lookup map;
  do not add a fourth join to the hottest query in the codebase.

## Task 5: Contacts — pure logic

`src/lib/contacts/name.ts` + `name.test.ts`:

- `displayNameOf(parts, fallbackEmail?)` — given/middle/family joined, **prefix and suffix
  excluded** (Google's rule, and "Dr. Smith Jr." is noise in a grid). Fallbacks: nickname →
  company → email → `"Unnamed contact"`.
- `fileAsOf(parts)` — stored override (trimmed) → `"Family, Given Middle"` → company →
  `displayNameOf`.
- `initialsOf(parts)`, `formalNameOf(parts)`, `formatBirthday(y, m, d)`.
- `primaryOf(items)` — flagged first, then lowest `sortKey`; must not mutate its input.
- `compareContacts(a, b)` — `Intl.Collator` with `sensitivity: "base"`; blank file-as sorts
  last.

Edge cases the tests must pin: everything blank; company-only (a clinic, a vendor);
email-only (and the email must _not_ feed initials); a whitespace-only `fileAs` override is
blank (`.trim()`, not `!== ""` — this is the bug that ships otherwise); no double spaces
around a missing middle name; hyphenated `"Mary-Jane"` → `"M"`; `"van der Berg"` → `"V"`
(pin the no-particle-heuristics choice so nobody silently "fixes" it); `Array.from(s)[0]`
not `s[0]`, so a surrogate pair isn't split; two flagged primaries resolve deterministically;
`primaryOf([])` is null; diacritic-insensitive ordering.

`src/lib/contacts/itemKinds.ts` + `itemKinds.test.ts` — per-kind config (title, singular,
suggested `label` options, which fields the editor shows, which columns the summary shows),
modelled on `src/components/detail/itemKinds.ts`. The test asserts every enum value has a
config entry, as the existing one does.

## Task 6: Contacts — data layer

`src/lib/contacts/{types,queries,mutations}.ts` + `mutations.integration.test.ts`, following
`src/lib/metrics/` as the own-table template.

`loadContacts(userId)` is **three queries assembled in TypeScript**, not one with laterals —
contacts, then `contact_items` of kind phone/email/address, then an open-discussion-item
count grouped by `contact_id`. The primary-selection rule then exists once, in `primaryOf()`,
called by both the grid and the drawer. `listMetrics` already does exactly this.

Mutations: `createContact` / `updateContact` / `deleteContact`, `createContactItem` /
`updateContactItem` / `deleteContactItem` / `moveContactItem`, and
`setPrimaryContactItem` — which must **clear the old primary and set the new one inside one
transaction**, or the partial unique index throws a raw Postgres violation at the user.
Every path that can set `isPrimary`, including create, routes through it.

`createDiscussionItem(userId, contactId, values)` composes existing pieces rather than
touching tables: `ensureInbox(userId)` (`src/lib/capture/mutations.ts`) → `createNode(…)` →
`saveNodeDetail(userId, nodeId, { task: { contactId, … } })`. **Parent to the Inbox, not to
null** — a root task inherits no result-area importance and scores strangely in the Chooser,
which shows up weeks later as "why is this ranked oddly".

`src/app/contacts/actions.ts` — `"use server"`, the same `run()` / `ActionResult` wrapper as
`src/app/metrics/actions.ts`.

Integration test: the standard `describeDb("user isolation")` block proving a second user
cannot read, update or delete the first's contacts _or_ contact items, plus two survival
tests — delete a contact that owns an open discussion task and a linked note, and assert
both rows still exist with null links.

## Task 7: Contacts — list page

`src/app/contacts/page.tsx` mirroring `src/app/metrics/page.tsx`, and
`src/components/contacts/{ContactsView,contactsColumns}.tsx` copying `WishesGrid`'s
structure.

Columns: Name (`hideable: false`, sorts by `fileAs`, opens the drawer), Company, Job Title
(hidden by default), Phone, E-mail (`mailto:`), City, Group, Contexts, Open (right-aligned
count, blank at zero), Updated (hidden by default).

Built-in views via `useModuleViews({ moduleId: "contacts" })`: **All Contacts** (default),
**Needs a Conversation** (filtered to open discussion items, sorted by count — this is the
view that makes the module earn its place), **By Company** (grouped).

No change to `src/lib/settings/scopes.ts` — `grid:contacts.all` and `views:contacts` already
parse under the existing `KEY_PATTERN`.

Shell wiring: `contacts` → `built`, `ContactsIcon`, `GO_KEYWORDS`.

## Task 8: Contacts — drawer

`src/components/contacts/ContactDrawer.tsx` on `Drawer` + `DrawerHeader` + `FormTabs` +
`DrawerFooter`, keyed on contact id, detail loaded by the parent — the `MetricDrawer`
pattern. Explicit Save that stays open; `DraftTextField` / `DraftTextArea` commit on blur.
Per-field autosave is wrong here: the house `run()` wrapper calls
`revalidatePath("/", "layout")` after every action.

Tabs: **General** (name grid, org, manager/assistant, group, birthday, then the Phone and
E-mail lists, then contexts and notes — broken up with `Section`), **Address** (Addresses and
Web URLs lists), **Discussion Items**, **History**. No Details tab, no Important Dates tab.

`src/components/contacts/ContactItemList.tsx` — ~150 lines, config-driven from
`src/lib/contacts/itemKinds.ts`. Borrows from `ItemList`: expand-in-place rather than a modal
over a modal, ↑/↓ reorder, `DraftTextField` commit-on-blur, `ComboboxField` for `label` with
the kind's suggestions. Drops: CSV import/export, priority column, sort-cycling headers.
Adds the one control contacts actually need — a **primary radio**, which is a within-list
single selection, not a per-row boolean.

## Task 9: Contacts — discussion items, history, and the reverse links

- `src/components/contacts/ContactDiscussionPanel.tsx` — open items first, then resolved.
  Resolved is the task's `state: "completed"`, set through the existing node-state mutation
  so completion behaves identically everywhere. Title links to `/tasks?detail=<nodeId>`. One
  inline create input. Read-mostly — do not embed a task editor in a contact drawer.
- **History reuses `src/components/notes/LinkedNotesPanel.tsx`** with one small
  generalization: change its `nodeId: string` prop to `link: { nodeId } | { contactId }` and
  pass it into `createNoteAction`. Five-line diff, one fewer component.
- `src/components/detail/TaskForm.tsx` — a Contact `ComboboxField` fed by
  `loadContactOptions`.
- Tasks grid — a Contact column resolved client-side from a contacts lookup map.
- `src/components/notes/NoteDrawer.tsx` — a Contact link field beside the existing node link.

## Task 10: Resources module

Schema: `resources` — `shortName`, `description`, `overheadPercent`, `effectivenessPercent`,
per-day working minutes (`mondayMinutes` … `sundayMinutes`), nullable `contactId`
(`set null`) since AP's Resource Information form links one. The full AP field set ships now
so a future automated-scheduling spec needs no migration, even though only the weekly hours
are consumed today.

- `src/lib/resources/{types,queries,mutations}.ts` + `mutations.integration.test.ts`.
- `src/lib/resources/capacity.ts` + `capacity.test.ts` — pure:
  `weeklyAvailableMinutes(resource)` = sum of the seven days, minus overhead %, times
  effectiveness %. Pin the rounding and the order of the two adjustments; AP applies overhead
  as a deduction and effectiveness as a multiplier, and getting them backwards is invisible.
- `src/app/resources/{page.tsx,actions.ts}`, `src/components/resources/{ResourcesView,
resourcesColumns,ResourceDrawer}.tsx`.
- **Wiring:** `src/components/planning/TimeBudgetStep.tsx` gains a resource select. Picking
  one calls `onAvailableChange(weeklyAvailableMinutes(resource))`; the value still lands in
  `weekly_plans.availableMinutes`, which stays authoritative and hand-overridable. Update the
  comment at `src/lib/planning/budget.ts:5` and the one in `TimeBudgetStep.tsx` — both
  currently say resources are out of scope.
- Shell wiring as above.

## Task 11: Remove File Organizer and Life Plan

Neither is currently in `MODULES` (only `life-plan` is, as `reserved`). Delete the
`life-plan` entry rather than leaving a reservation for something we've decided against, and
record the reasoning in `shape.md` — a future reader will otherwise re-derive the question.

## Task 12: Verify, freeze spec, update roadmap

- Drive all four modules in a real browser via the `run-planner` skill. Check the `Library`
  section on a phone viewport.
- `npm run test:unit` **with Postgres up** — check for the skip warning; `npm run
test:integration`; `npm run lint`; `npx tsc --noEmit`; `npm run build`.
- Fix `agent-os/standards/components/navigation.md`, which is stale post-rename (it still
  says `src/components/shell/views.ts` and `sectionsWithViews()`).
- Complete **Changes from original plan**; set **Status: frozen / complete (date)** on
  `plan.md` and `shape.md`; list Google People sync and automated scheduling as _new work_.
- Update `agent-os/product/roadmap.md` and the "Explicitly low priority or out" row in
  `agent-os/product/achieve-backlog-notes.md`.

---

## Verification

**Per module, in the browser:** create a record, edit it, filter the grid, save a view,
reload and confirm the view stuck, delete the record.

**Contacts specifically:**

1. Create a contact with two phones; make the second primary; confirm the grid column and
   the drawer agree, and that the database has exactly one flagged row for that kind.
2. Add a discussion item; confirm the task appears in `/chooser` and in the Inbox, and that
   the Task drawer shows the contact.
3. File a note against the contact; confirm it appears in History and in `/notes`.
4. Delete the contact; confirm the task and the note survive with null links.

**Cross-cutting:** `⌘K` → each of the four new modules. Sidebar collapsed (icon rail) with
`Library` present. Phone: bottom nav unchanged, More sheet shows the new section.

## Standing rule while this spec is active

Material changes to requirements, design or scope — including from feedback on what gets
built — go into `plan.md` / `shape.md`, with a row appended to **Changes from original
plan**. Skip pure implementation details. Freeze when verified.
