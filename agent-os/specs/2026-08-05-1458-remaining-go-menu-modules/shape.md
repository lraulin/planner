# Remaining Go-menu modules — Shaping Notes

**Status: active**

## Scope

Finish Achieve Planner's **Go** menu. Achieve reached sixteen destinations through it
(manual §1.3); we have built eleven. This spec builds the four that remain and closes the
question on the two that never will be.

| Module           | What ships                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Contacts**     | A real address book with its own table, shaped to the Google People API. Discussion Items become tasks; Contact History becomes notes. |
| **Time Charts**  | A list page. The tables, queries, mutations and the full editor already exist at `/schedule/time-chart/[chartId]`.                     |
| **Result Areas** | A node grid filtered to `result_area`, opening the existing Result Area drawer.                                                        |
| **Resources**    | AP's resource records, wired to the weekly wizard's time budget.                                                                       |

### Out of scope

- **File Organizer — permanently.** It is a table of records standing in for paper
  documents, CDs and books. We have no file storage, so there is nothing to organize. It is
  a different product.
- **Life Plan — permanently.** Manual §10.2: "a free form note editor where you can store
  your strategic life plan." One document, no form, no fields. A note is already that, with
  a better editor and a place in a hierarchy. The reserved `life-plan` entry comes out of
  `MODULES` rather than sitting there implying we still might.
- **Google People API sync.** The contacts schema is built so a later delta-spec needs no
  migration, but this spec makes no API calls and adds no OAuth scope.
- **Automated scheduling.** Resources exist in Achieve to feed it (manual §7.2.7). We ship
  the full AP field set so a future spec has the data, but nothing schedules automatically.
- **AP's Contact Details grid** — CustomerId, Language, Hobbies, Referred By, Spouse,
  Children, Profession — and the Important Dates list. See the decision below.
- **Overview tab.** Not a data module; a dashboard. Still unshapen, still optional.

## Decisions

### Contacts get their own table, People-shaped

The existing `node_items` kind `"contact"` is a _goal-planning_ list — its empty state reads
"Who do you need to be able to reach?" — and is not an address book. It stays exactly as it
is; this module is new.

The table carries the six `external_*` columns and the partial unique index that
`appointments` uses for Google Calendar, so the sync delta-spec is code, not a migration.
Two of those six are placeholders: `external_series_id` has no People analogue at all, and
`external_calendar_id` is repurposed for the collection (`connections` vs `otherContacts`).
Both are documented in the schema comment so the sync author doesn't spend an afternoon
looking for what belongs in them.

**Field map (our column ↔ People `person.…`)**, for the delta-spec to start from:

| ours                                                                    | People                                                                                                                   | note                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `namePrefix` / `givenName` / `middleName` / `familyName` / `nameSuffix` | `names[0].honorificPrefix` / `.givenName` / `.middleName` / `.familyName` / `.honorificSuffix`                           |                                                                                         |
| _(derived)_                                                             | `names[0].displayName`, `.displayNameLastFirst`                                                                          | output-only; never sent                                                                 |
| `nickname` / `initials`                                                 | `nicknames[type=DEFAULT/INITIALS].value`                                                                                 |                                                                                         |
| `fileAs`                                                                | `fileAses[0].value`                                                                                                      | verify settable                                                                         |
| `company` / `jobTitle` / `department`                                   | `organizations[0].name` / `.title` / `.department`                                                                       |                                                                                         |
| `managerName` / `assistantName`                                         | `relations[type=manager/assistant].person`                                                                               | a name string, not a link; a sync writes the first match and must not delete the others |
| `groupName`                                                             | `memberships[].contactGroupMembership`                                                                                   | needs `contactGroups.list` to map name ↔ resource name                                  |
| `birthdayYear/Month/Day`                                                | `birthdays[0].date.{year,month,day}`                                                                                     |                                                                                         |
| `photoUrl`                                                              | `photos[0].url`                                                                                                          | output-only; mirror, never write                                                        |
| `notes`                                                                 | `biographies[0].value`                                                                                                   | see the clobber rule                                                                    |
| `contexts`                                                              | —                                                                                                                        | **local-only**                                                                          |
| item `value`/`label`/`isPrimary`                                        | `phoneNumbers`/`emailAddresses`/`addresses`/`urls` `[].value` / `.type` / `.metadata.primary`                            |                                                                                         |
| item `displayName`                                                      | `emailAddresses[].displayName`                                                                                           |                                                                                         |
| item address parts                                                      | `addresses[].streetAddress`, `.extendedAddress`, `.poBox`, `.city`, `.region`, `.postalCode`, `.country`, `.countryCode` | `formattedValue` is output-only                                                         |
| item `notes`                                                            | —                                                                                                                        | **local-only**                                                                          |

`contact_item_kind` seeds four unrendered values — `relation`, `event`, `im`, `user_defined`
— so People's `relations`, `events`, `imClients` and `userDefined` land later without an
`ALTER TYPE` on a live enum. `userDefined` is where AP's dropped Details fields go if they
are ever missed, which is part of why dropping them is safe.

### Discussion Items are tasks; Contact History is notes

Achieve's Discussion Items grid has Priority, Title, Type, Context, Description, Deadline and
Resolved. Every one of those is a task field. Modelling them as their own table would build
a second, worse task list that the Task Chooser, the Day view and deadline handling could not
see. A nullable `task_details.contactId` makes them real tasks instead.

Contact History has Subject, Type, Context, Start Date and Notes — a note with a date. A
nullable `notes.contactId` gets markdown, flags and the Notes module for free.

Achieve's Type dropdown on both (Answer Questions / Follow-Up Call / Negotiation / …) maps to
nothing we have and is dropped. Its Context maps to the _task's_ `contexts`, which is a
different field from the _contact's_ `contexts`. Three similar-sounding things; they stay
three things.

### `contactId` lives on `task_details`, not `nodes`

`nodes` is selected whole by `loadOutline`'s recursive CTE on every page in the app. A
discussion item is task-only — a result area does not have one. `task_details.exerciseId` is
the exact precedent: a nullable task-only FK to a standalone catalog with `on delete set
null`, justified as "history lives elsewhere; deleting the task never erases it." Putting it
here also means `saveNodeDetail` accepts it with no new plumbing.

### Deleting a contact never deletes work

`task_details.contactId` and `notes.contactId` are `on delete set null`; `contact_items`
cascade. The integration test proves it: delete a contact with an open discussion task and a
linked note, and both survive with null links.

### One child table, not four, and not JSONB

`jsonb` appears exactly once in `src/db/schema.ts` — `user_settings.value` — with a comment
saying it is deliberately not authoritative. Every piece of real data in this codebase is
relational, including `node_items`, a sparse table serving twenty kinds on the argument that
"they share one shape … so they share one table." Phones, emails and URLs are literally
`(label, value, primary, notes)`; addresses add seven sparse part columns.

The decisive argument is the primary flag. `uniqueIndex(userId, contactId, kind).where(is_primary)`
makes "at most one primary per kind" a fact the database enforces. In JSONB it is an
invariant nobody enforces and the grid has to filter with `jsonb_path_query`.

### Resources ship wired, not decorative

The comment at `src/lib/planning/budget.ts:5` currently reads "We have no resources, so there
is one budget for the week." The wizard's time-budget step gains a resource select; picking
one fills `weekly_plans.availableMinutes` from the resource's weekly hours. The stored value
stays authoritative and hand-overridable — the resource supplies a number, it does not own it.

The full AP field set (overhead %, effectiveness %, per-day working hours, linked contact)
ships now even though only the hours are read, so a future automated-scheduling spec is code
rather than a migration. The user's stated intent: "I might want to implement the automated
scheduling at some point so I can at least give it a chance."

### `ItemList` is not generalized

`src/components/detail/ItemList.tsx` is 524 lines typed against `NodeItem`. Generalizing it
over a row type would touch every detail form in a spec about contacts — the highest blast
radius available for the least benefit. Half of what it does is also wrong here: CSV
import/export per list (a person has three phone numbers, not forty), a priority column, and
no concept of a **primary**, which is a within-list single selection rather than a per-row
boolean.

`ContactItemList` borrows the good ideas — expand-in-place instead of a modal over a modal,
↑/↓ reorder, config-driven editor, commit-on-blur — at roughly 150 lines. If a third caller
for a generic repeating list ever appears, generalize then.

## Context

- **Visuals:** `visuals/` — AP's Contact Information form (General / Address / Details /
  Discussion Items / History), the Contact History form with its Type dropdown across three
  screenshots, the Discussion Item dialog, the Resources list and Resource Information form,
  the Time Charts list, and the Wish List. Reference for _what the features are_; the UI is
  ours to improve.
- **References:** see `references.md`.
- **Product alignment:** closes the Phase 1 Achieve reimplementation. Supersedes the
  "Contacts, File Organizer, Resources tabs" row in
  `agent-os/product/achieve-backlog-notes.md` for three of the four, and confirms File
  Organizer.

## Standards Applied

- `database/migrations.md` — three new tables, three new columns on existing tables, one
  enum. Generated migrations only; `.sql` + snapshot + journal committed together.
- `development/testing.md` — pure logic in `src/lib/**` with tests beside it; every
  DB-touching module gets an integration test whose user-isolation block proves a second
  user cannot read, change or delete the first's rows.
- `components/data-grid.md` — four new grids on the shared `DataGrid`; the three-tier
  toolbar rule (bar / `⋯` / dialog).
- `components/drawer-pattern.md` — the contact and resource drawers.
- `components/navigation.md` — one module registry, five surfaces, no hard-coded modules.
  (This file is stale post-rename and gets fixed at freeze.)
