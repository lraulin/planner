# Life history — Shaping Notes

**Status: active**

## Scope

Three Library pages backed by three new tables:

- **Timeline** (`/library/timeline`) — a chronology datagrid, one row per date. Miscellaneous
  life events are stored here; job and residence dates appear here derived.
- **Jobs** (`/library/jobs`) — employment history with the field set a job application asks
  for.
- **Residences** (`/library/residences`) — where you have lived, internationally.

### Out of scope

- The timeline **visualization**. Lee asked for "maybe a nice timeline data visualization"
  and agreed to defer it: build the grid, get real data in, then shape the picture around
  what the data turns out to look like. It lands later as a `Grid | Timeline` presentation
  pair, the mechanism Notes already uses for `Grid | Journal`.
- **Linking** — life events to Contacts ("linking them contact dates could be pursued in the
  future"), or richer links to the record a date belongs to. The Jobs/Residences derivation
  _is_ the first instance of that idea; generalizing it is later work.
- **Partial dates.** Contacts already model an optional birthday year, so the precedent
  exists — Lee chose exact dates anyway, and guessing when the exact day is forgotten.
- Deriving chronology rows from any other dated table (nodes, fitness sessions, finance
  transactions). Every one of those has dates; almost none of them are life events.

## Decisions

### Why not the Events datagrid

This started as "can I do this with the Events datagrid?" and the answer is no. Appointments
carry recurrence, and a recurring appointment is not one record with one date — it is a rule
that expands into occurrences. A historical fact ("I moved to Seoul on this day") is a single
immutable point. Putting the two in one table means every chronology read has to suppress
expansion, and every recurrence feature has to remember a class of row it must not touch.
Separate records, separate page.

### Chronology, not spans

The first shaping pass proposed one row per job with a start, an end and a duration column.
Lee rejected it: _"The idea for this dates grid is more to be a chronology… If I want to see
the start and end date together for each job, I can go to the jobs page to see that."_

That is the sharper design. The Timeline grid answers "what happened, in order"; the Jobs and
Residences grids answer "how long did that last". Each page has one job. It also means the
`life_events` table needs no end date at all, which removes a nullable field and the "is this
a point or a span" branch from every column.

### Why Jobs and Residences exist at all

The request was "just a datagrid for dates". It grew one step during shaping, and for a good
reason: the two things Lee named wanting to look up — _when did I start that job, when did I
move_ — are attributes of records that do not exist yet. Typing "Started at Acme" as a loose
event string is a worse version of having a Jobs record, because the moment you want the
address or the supervisor's name for an application, the event string cannot hold it.

So the dated records get real homes, and the chronology derives from them. Lee: _"might as
well go ahead and a jobs page in Library with at least a basic set of fields for everything
you'd have to fill out for a job application/resume… And while we're at it, I guess another
for residences. And make it international since I lived in Korea."_

### Derived, not copied

Job and residence dates are computed into chronology rows at read time. Copying them into
`life_events` on save would be faster to query and would immediately drift: rename an employer
and the event string still says the old name.

### International by construction

Lee lived in Korea, so the address shape cannot be US-shaped. Rather than invent one, reuse
the column names already on `contact_items` — `street_address`, `extended_address`, `city`,
`region`, `postal_code`, `country`, `country_code` — which exist in that shape because they
came from Google People. Labels say "State / Province / Region" and "Postal code".

### Storage encoding

`date({ mode: "string" })` rather than the nodes' timestamptz-at-UTC-noon. `development/dates.md`
permits both; the reason to pick this one is that the whole domain is calendar days with no
instants in it, so the stored value can simply _be_ the `YYYY-MM-DD` key. No encoding round
trip means the Aug 1 → Jul 31 regression that standard exists to prevent has no surface to
occur on. Finance already made the same choice.

## Context

- **Visuals:** None.
- **References:** `src/lib/resources/` + `src/app/library/resources/` +
  `src/components/resources/` as the flat-catalog template; `contact_items` (`schema.ts:1818`)
  for the address shape; `src/components/grid/catalogCommands.ts` for the verb wiring;
  `src/lib/schedule/geometry.ts` for `daysBetweenKeys`; `agendaColumns.tsx` for the
  deliberately-not-shared days-remaining column. Full list in `references.md`.
- **Product alignment:** Beyond the Achieve reimplementation — Achieve has no life-history
  feature. This is one of the "beyond Achieve" personal-reference tracks, sitting next to
  Contacts and Resources as data you maintain rather than work you do.

## Standards Applied

- `components/data-grid.md` — the one shared DataGrid; column defs, distinct-value filters,
  persisted preferences via `useGridState` / `useModuleViews`.
- `components/drawer-pattern.md` — Jobs and Residences get full-record drawers; Timeline
  deliberately does not.
- `components/navigation.md` — Page tier, page-bar registration, and the rule that a command
  without a menu entry is not shipped.
- `components/ux-principles.md` — inline editing, commit on blur, tabs for form sections.
- `database/migrations.md` — generate rather than hand-write; commit SQL, snapshot and journal
  together.
- `development/dates.md` — the two kinds of date value and which helpers are canonical.
- `development/clean-code.md` — `app → components → lib → db`; every mutation takes `userId`.
- `development/security.md` — ownership proven on every write, cross-user delete
  indistinguishable from a missing row.
- `development/testing.md` — pure logic and DB mutations tested, no component tests, every
  integration test carries a second-user case.
