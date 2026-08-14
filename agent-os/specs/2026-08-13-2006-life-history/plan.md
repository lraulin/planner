# Life history — Timeline, Jobs, Residences

**Status: frozen / complete** (2026-08-13)  
Spec folder: `agent-os/specs/2026-08-13-2006-life-history/`

This is the authoritative as-built record. Further work (the timeline visualization,
linking, partial dates) should open a new delta-spec.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-13-0845-module-consolidation/` — Library as the home
  for "reference data you maintain rather than places you work", and the flat eight-module
  sidebar. This spec adds three Library **pages** and no new module.
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — the Page tier, the ≥2-page bar
  floor, and `lastPage` stickiness. Library goes from two pages to five; nothing about the
  mechanism changes.

## Context

Lee wants a place to record important personal dates and look them up later: when a job
started, when a move happened, how old the pets are. The first instinct was to use the
Events/Agenda datagrid, but calendar recurrence makes appointments the wrong substrate — a
one-off historical fact is not a scheduled occurrence, and recurrence rules would have to be
suppressed everywhere it was displayed.

So: its own records, its own page. Shaping widened it usefully. Rather than typing "started at
Acme" as loose text, the records that _have_ dates get real homes — **Jobs** and
**Residences**, each with the field set a job or rental application actually asks for, and each
international because Lee lived in Korea. Their start/end dates then flow into the chronology
automatically, alongside miscellaneous one-off life events.

**Outcome:** three new Library pages. Timeline is a read-mostly chronology grid; Jobs and
Residences are catalogs you maintain. The timeline _visualization_ is deliberately deferred
until there is real data to shape it.

## Decisions

Confirmed with Lee during shaping:

| #   | Decision                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Library pages, not new modules.** `/library/timeline`, `/library/jobs`, `/library/residences`. Library is reference data you maintain; the consolidation spec just flattened to eight modules and a ninth cuts against it. |
| 2   | **The Timeline grid is a chronology: one row per date, never a span.** A job contributes up to two rows ("Started at…", "Left…"). To see a job's start and end together you go to the Jobs page.                             |
| 3   | **Derived rows are computed at read time, never copied into a table.** Nothing to drift out of sync.                                                                                                                         |
| 4   | **Exact dates only.** Every date is a full `YYYY-MM-DD`. No partial-precision flag, even though Contacts has one for birthdays. Guess when you don't remember.                                                               |
| 5   | **Categories are free text** on life events; the set filter learns your values through `collectDistinctValues`, as it already does elsewhere. Derived rows carry a fixed `Work` / `Home`.                                    |
| 6   | **Elapsed columns in the MVP, timeline visualization later.** A later delta adds `Grid \| Timeline` presentations the way Notes has `Grid \| Journal`.                                                                       |
| 7   | Jobs carry employer address + phone, a supervisor block, pay + reason for leaving, and employment type. Residences carry a landlord block, rent + housing type, and reason for leaving.                                      |

Design decisions that follow from the code:

- **Calendar days store as `date({ mode: "string" })`, not timestamptz-at-UTC-noon.** This is a
  pure calendar-day domain with no instant semantics anywhere in it. Finance already does this
  and `development/dates.md` sanctions both encodings. The stored value _is_ the `YYYY-MM-DD`
  key, so the Aug 1 → Jul 31 bug class cannot arise — there is no encode/decode round trip to
  get wrong. Comparisons, sorts and `daysBetweenKeys` all take the column as-is.
- **Elapsed math is pure integer arithmetic on `YYYY-MM-DD` components — no `Date` objects.**
  `addMonths` in `dateMath.ts` is local wall-clock and is the wrong tool. Component arithmetic
  is TZ-proof by construction and trivially testable.
- **The page is called "Timeline", not "Dates".** `src/lib/dates/` would read as date
  utilities, and "Timeline" is the name that survives when the visualization lands as a second
  presentation of the same records.
- **No `pgEnum` for employment type, housing type or pay period.** These are open vocabularies,
  and `schema.ts` already warns that `ALTER TYPE … ADD VALUE` fails on Neon's transaction-mode
  pooler. Free text with a suggestion list, the way `contacts/itemKinds.ts` does it.

## Field sets

**Jobs** — employer, job title, employment type, start date, end date (null = current), duties,
reason for leaving, starting/ending pay + pay period, employer phone, employer address (the
`contact_items` international shape: street, extended, city, region, postal code, country,
country code), supervisor name/title/phone/email + may-contact flag, notes.

**Residences** — optional label ("The Seoul apartment"), the same international address shape,
moved-in, moved-out (null = current), housing type, monthly rent, reason for leaving, landlord
name/phone/email, notes.

"State" is labeled **State / Province / Region** and ZIP is **Postal code**, since Korea has
neither. Country stays free text.

## Acceptance criteria

- [x] The Library page bar shows five tabs: Contacts, Resources, Timeline, Jobs, Residences.
- [x] A job with a start and an end date produces exactly two rows on Timeline, categorized
      `Work`; a current job (null end) produces one.
- [x] A residence produces the same, categorized `Home`, and a Korean address round-trips with
      no US-shaped field mangling it.
- [x] A miscellaneous life event can be created, retitled, recategorized, redated and deleted
      inline on the Timeline grid.
- [x] The Days-ago and Elapsed columns are correct across a leap day and a month-end borrow,
      and render blank rather than wrong before hydration.
- [x] Filtering by category offers the values actually in use, derived and typed alike.
- [x] A derived row cannot be edited or deleted from Timeline; Open takes you to the record on
      its own page with that row selected.
- [x] A second user cannot read, update or delete the first user's jobs, residences or events.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish is
omitted deliberately.

| #   | Change                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Opening a derived row uses the existing **`?detail=`** param, not a new `?open=` one the plan invented.                                                | Shaping described `?open=` as "the one genuinely new mechanism (~10 lines)". It was not new: `?detail=` is already the deep-link-to-drawer param, read through `useViewStateUrl` and used by Contacts, the outline and `ContactDiscussionPanel`. This spec now adds no navigation mechanism at all.                                                                                                        |
| 2   | **Duration is computed on the client, not in the query**, and rides on the grid row.                                                                   | An ongoing job is measured against today and the server does not know the user's day. `ColumnDef.sortValue` receives only the row, so a context-derived duration could not be sorted -- and unlike Agenda's days-left, duration is not monotonic in the date, so sorting on the date is wrong. Hence `lib/history/span.ts` and the `JobGridRow` / `ResidenceGridRow` view models, neither of them planned. |
| 3   | Money is a **`numeric` string end to end**, not a number.                                                                                              | `MoneyField` writes a string and Drizzle reads one back; parsing to a float in between is how cents go missing. Matches the finance tables.                                                                                                                                                                                                                                                                |
| 4   | Category, Source, employment Type, Housing and Country declare **`filterKind: "enum"`** despite being free text in the database.                       | The kind picks the _control_, not the storage, and `usesSetFilter` is enum-only. Declared as `text` they offered only `(All)/(Blanks)/(NonBlanks)`, so "categories so I can filter them" did nothing. Free text is how they are stored and typed; the checklist is how they are filtered, and its vocabulary is still derived from the rows.                                                               |
| 5   | Two shared pieces were **extracted rather than copied**: `formatPostalAddress` out of `summarizeContactItem`, and `DateKeyCell` out of `DeadlineCell`. | Three tables now hold an address in the same seven columns, and two grids now hold an editable calendar day. One rule, one implementation.                                                                                                                                                                                                                                                                 |
| 6   | Two pre-existing bugs fixed on the way through, both in shared grid code.                                                                              | `catalogCapabilities` had its two `disabled` conditions swapped, which is live on Contacts today: a Google-synced contact cannot be opened and _can_ be deleted. And the grid date cell committed on every keystroke rather than on blur, against `ux-principles.md` -- survivable on Deadline, not on a page where every row is a typed year.                                                             |
| 7   | The narrow-viewport pass was **not completed** in this cycle.                                                                                          | The automated window resize did not take effect in the browser session. The page bar and compact-row behaviour are shared chrome this spec does not change, and Lee validates mobile on the deployed phone. Noted rather than claimed.                                                                                                                                                                     |

---

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`. No `visuals/` — none were
provided.

## Task 2: Schema and migration

`src/db/schema.ts` — three user-owned tables following the house shape exactly (`uuid`
`.primaryKey().defaultRandom()`, `userId` FK `onDelete: "cascade"`, timestamptz
`createdAt`/`updatedAt`, every index leading with `userId`), modeled on `resources` and reusing
the address column names from `contact_items`:

- `life_events` — `event_date date NOT NULL`, `title`, `category`, `notes`; index on
  `(user_id, event_date)`.
- `jobs` — the field set above; `numeric(14,2)` for pay; index on `(user_id, start_date)`;
  CHECK `end_date IS NULL OR start_date IS NULL OR end_date >= start_date`.
- `residences` — the field set above; index on `(user_id, moved_in)`; the equivalent CHECK.

Then `npm run db:generate`, read the generated SQL, `npm run db:migrate`, and commit the `.sql`
plus `meta/NNNN_snapshot.json` and `_journal.json` together.

## Task 3: Elapsed-time helpers (pure, tested first)

`src/lib/timeline/elapsed.ts`:

- `daysSince(dateKey, todayKey)` — over `daysBetweenKeys` from `src/lib/schedule/geometry.ts`.
  Reuse, do not reimplement.
- `elapsedParts(fromKey, toKey)` — `{ years, months, days }` by integer component arithmetic
  with month-length borrowing.
- `formatElapsed(parts)` — `"24y 3m 11d"`, dropping leading zero units.

`elapsed.test.ts` beside it: leap day (`2024-02-29` → `2025-02-28`), month-end borrow
(`2024-01-31` → `2024-03-01`), exact anniversaries, same day, and a future date.

Do **not** lift `daysLeftOf` / `daysLeftTitle` out of `agendaColumns.tsx`. Agenda's column
answers "how soon" with prose ("In 3 days"); this one answers "how long ago" with a number and
a duration. Same date math, different columns — merging them produces a helper with a mode
flag.

## Task 4: Data layer

`src/lib/jobs/`, `src/lib/residences/` and `src/lib/timeline/`, each `types.ts` + `queries.ts`

- `mutations.ts` modeled on `src/lib/resources/`. Every function takes `userId` first and
  scopes by it; updates build a patch from defined fields only, set `updatedAt`, and re-assert
  `and(eq(t.id, id), eq(t.userId, userId))`; deletes use `.returning({ id })` and throw on empty
  so a cross-user delete is indistinguishable from a missing row. Hand-written throwing
  validators, not zod.

`src/lib/timeline/chronology.ts` — `loadChronology(userId)` over a pure
`deriveChronology(events, jobs, residences)` with its own test, so the shaping is testable
without a database:

```ts
type ChronologyRow = {
  id: string; // "event:<uuid>" | "job:<uuid>:start" | "residence:<uuid>:out"
  dateKey: string; // YYYY-MM-DD
  title: string;
  category: string; // free text | "Work" | "Home"
  notes: string;
  source: "event" | "job" | "residence";
  sourceId: string | null; // the job/residence uuid, for open-in-place
};
```

A job yields `Started at {employer}` and `Left {employer}`, notes = job title; a residence
yields `Moved to {city}` / `Left {city}`, notes = the formatted address. Null dates yield no
row.

Integration tests beside each mutations module, each with the cross-user case required by
`development/testing.md`. Check for the Postgres-down skip warning after running.

## Task 5: Jobs and Residences pages

Copy the `ResourcesView` shape — the closest analogue (flat, user-owned, non-tree catalog with
full CRUD). Routes and actions under `src/app/library/{jobs,residences}/`; views, columns and
drawers under `src/components/{jobs,residences}/`. Grid columns are the summary; the drawer
holds the full field set, tabbed per `components/ux-principles.md`. Verbs come from
`catalogCapabilities`, which wires toolbar, menu bar, ⌘K and right-click in one call.

## Task 6: Timeline page

`src/app/library/timeline/` and `src/components/timeline/`.

Columns: **Date** · **Event** · **Category** (set filter) · **Days ago** · **Elapsed** ·
**Source** · **Notes**. Default sort is date ascending — a life reads oldest first. `useToday()`
returns `null` on the server, so the computed columns render blank pre-hydration rather than
guessing a timezone.

Event rows edit inline; four fields do not justify a drawer. Derived rows are read-only here:
`catalogCapabilities` takes a `deleteDisabled` reason, so a selected job row disables Delete
with "Edit this on the Jobs page", and Open navigates to `/library/jobs?detail=<sourceId>`.

`?detail=` is the existing deep-link-to-open-drawer param, read through `useViewStateUrl` and
already used this way by Contacts, the outline and `ContactDiscussionPanel`
(`/tasks?detail=<nodeId>`). Jobs and Residences bind their drawers to it the way `ContactsView`
does — "`?detail=` is the only source of truth for which record is open, so a clicked row and a
pasted URL take the same path". There is no new navigation mechanism in this spec.

## Task 7: Register the pages

`src/lib/navigation/pages.ts` — three entries under `library` with ⌘K keywords, giving the bar
Contacts | Resources | Timeline | Jobs | Residences. Contacts stays `isDefault`. Extend the
header comment that explains what deliberately is not a Library page. No `modules.ts` change;
`scripts/smoke.mjs` walks `src/app` at runtime, so there is no route list to update.

## Task 8: Verify, freeze spec, update roadmap

Done. Browser: five-tab Library bar; a job and a Korean residence producing four derived
rows; create / retitle / recategorize / redate an event; Category checklist offering Home,
Pets and Work together; event delete (New event → Delete event → confirm → empty state).
Cross-user isolation is the integration tests. The narrow-viewport pass was not completed
— see change 7.

## Follow-ups (new work — not amendments to this frozen spec)

- The timeline **visualization** — a later delta, as `Grid | Timeline` presentations,
  once there is real data to shape it around.
- **Linking** life events to Contacts, or to the job/residence they describe beyond the
  automatic derivation.
- Partial dates (year-only, month + year).
- Deriving chronology rows from anything else that has dates (nodes, fitness, finances).
