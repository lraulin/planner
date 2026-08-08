# Date and time handling

This app is calendar-day heavy (plans, deadlines, shelves, day pages) with a smaller set
of true instants (created/updated, completion history, appointments). Getting the two kinds
mixed is how completed dates show as the wrong day after a save.

Domain meanings of the four node dates live in `product/date-model.md`. This file is the
**mechanics**: storage, keys, UI, and tests.

Stack: Next.js + TypeScript + Drizzle + Postgres. No date-fns / Day.js / Luxon — keep
helpers in `src/lib/schedule/geometry.ts` and `src/lib/dateMath.ts`.

## Two kinds of value

| Kind             | Means                      | Examples                                                                                                            | Store / compare as                                             |
| ---------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Calendar day** | A date with no time of day | deadline, deferred, target start/end, actual start, date completed, day page `day`, note date, all-day Google dates | **UTC noon** of that day in `timestamptz`; key via `toDateKey` |
| **Instant**      | A real moment in time      | `created_at`, `updated_at`, `nodes.completed_at`, `task_completions.completed_at`, timed appointments               | `timestamptz`; compare as instants                             |

Never use one kind’s helpers for the other.

## Why UTC noon (not local midnight)

**Regression this encoding exists to prevent (Lee, 2026-08):** set Date completed to
**Aug 1** → save → field showed **Jul 31**. Target start/deferred correctly went to Aug 8.

What happened:

1. Browser in US Eastern stored **local midnight** Aug 1 → `2026-08-01T04:00:00.000Z`
2. Server process in **UTC** ran `startOfDay` → `2026-08-01T00:00:00.000Z`
3. Browser read with **local** getters → evening of **Jul 31**

So calendar days are encoded as **UTC noon of the intended `YYYY-MM-DD`**. Then `toDateKey`
(UTC date components) returns the same key on every machine. Do **not** “fix” with
`startOfDay` on the server — that is process-local and reintroduces the bug.

“Is it still Tuesday **for me**?” is different — that uses **`localDateKey`** / `useToday`
(wall clock of an instant).

## Core rules

1. **Postgres timestamps are timezone-aware** (`timestamptz`).
2. **Every calendar-field write** goes through `fromDateKey` / `asCalendarDay` / `recordDate`
   (detail) — never raw `startOfDay`, never process-local midnight.
3. **Every calendar-field read** for display/compare uses `toDateKey` (UTC components of the
   stored encoding).
4. **Never `new Date("YYYY-MM-DD")`** (UTC midnight) and never process-local
   `new Date(y, m - 1, d)` in shared server/client code.
5. **Never `date.toISOString().slice(0, 10)` ad hoc** — call `toDateKey` or `localDateKey`.
6. **Bare `YYYY-MM-DD` strings** (day page URLs, day keys) are labels; shift with
   `shiftDateKey` / `daysBetweenKeys`.
7. **Instants stay instants** until display (`completedAt` history vs `dateCompleted` day).
8. **No business rule may depend on the server’s `TZ`.** Pass `today: string | null` into
   pure helpers. UI “today” is `localDateKey` on the client.

## Canonical helpers

| Need                           | Use                                                    |
| ------------------------------ | ------------------------------------------------------ |
| Stored calendar Date → day key | `toDateKey` (UTC components)                           |
| Day key → stored Date          | `fromDateKey` (UTC noon)                               |
| Normalize any Date → calendar  | `asCalendarDay` (= `fromDateKey(toDateKey(…))`)        |
| Wall-clock day of an instant   | `localDateKey`                                         |
| “Today” in the UI              | `useToday()` → `localDateKey(new Date())` or `null`    |
| Add days then store calendar   | `asCalendarDay(addDays(…))` (see recurrence)           |
| Whole days between keys        | `daysBetweenKeys`                                      |
| Date input                     | `DateField` — `toDateKey` display, `fromDateKey` write |

`startOfDay` / `addDays` in `dateMath.ts` are **local wall-clock** helpers for appointment
_times_ and intermediate math. After stepping a **calendar** field, re-encode with
`asCalendarDay` before writing.

## Database

- Prefer `timestamptz` for every timestamp column.
- Calendar-day columns: only the date half is meaningful; writers store **UTC noon**.
- Instant columns store the true moment.
- Record dates (`actual_start_date`, `date_completed`): never in the future; clamp on write.
  See `product/date-model.md`.

## Forms and detail drawer

- `DateField` shows `toDateKey(value)` and writes `fromDateKey(picked)`.
- Plan dates on `nodes` (deadline, deferred, target start/end) are re-encoded with
  `asCalendarDay` on save.
- **Record** fields: `max={localDateKey(new Date())}`; server uses `recordDate`.
- Completing a task stamps `date_completed` with `asCalendarDay(at)`, not `startOfDay(at)`.
  Recurrence moves plan dates with `asCalendarDay` after `addDays`.

## Display and grids

- Grid date columns: `toDateKey(date)`.
- Overdue / “today” comparisons: field’s `toDateKey` vs `useToday()` (`localDateKey`).
- Compact labels: `formatCompactDate(toDateKey(date))`.

## Testing (required regressions)

Calendar fixtures: `fromDateKey("2026-08-01")`. Assert with `toDateKey`. Do **not** assert
`getHours() === 0` (values are UTC noon).

**The suite runs in a pinned zone** — `TZ: "America/New_York"` in `vitest.config.ts`. Some
tests are _about_ local wall clock (the DST spring-forward in `recurrence.test.ts`, the
Aug 1 → Jul 31 story below) and only mean anything in a named zone; the rest must not care.
That is the point of the pin: a test that changes its answer with the machine's zone is
either testing the wrong thing or using a local-midnight fixture where the standard above
says `fromDateKey`. Do not remove it to "fix" a failure — the pin is what makes CI, a Vercel
build (UTC) and a laptop agree.

Must keep green:

1. **Round-trip:** `toDateKey(fromDateKey(k)) === k` for several keys.
2. **Aug 1 / Jul 31:** encoding survives “server UTC + client Eastern” story (see
   `geometry.test.ts` and detail mutation integration tests).
3. **Complete-via-date + regenerate:** complete on day D → `dateCompleted` key is D, deferred
   / target start are D+interval (not D−1).
4. **No re-cycle** when the same calendar day is re-saved on a recurring task.

## Common pitfalls

| Pitfall                                             | Why it hurts                                | Do instead                           |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `startOfDay` on calendar fields on the server       | Server TZ rewrites the day (Aug 1 → Jul 31) | `asCalendarDay` / `fromDateKey`      |
| Local midnight encoding                             | Client TZ ≠ server TZ                       | `fromDateKey` (UTC noon)             |
| Local getters for stored field keys                 | Off-by-one after evening / SSR              | `toDateKey` (UTC)                    |
| `localDateKey` for stored deadlines                 | Wrong near zone boundaries                  | `toDateKey`                          |
| `toDateKey(new Date())` for picker max / “today” UI | UTC “today” on the server                   | `localDateKey` / `useToday`          |
| Asserting `getHours() === 0` on calendar fields     | Fails; stored as UTC noon                   | `toDateKey` / `getUTCHours() === 12` |

## Where things live

| Concern                       | Location                                            |
| ----------------------------- | --------------------------------------------------- |
| Day keys, calendar encoding   | `src/lib/schedule/geometry.ts`                      |
| Local wall-clock arithmetic   | `src/lib/dateMath.ts`                               |
| DateField                     | `src/components/detail/fields.tsx`                  |
| Today hook                    | `src/components/grid/useToday.ts`                   |
| Detail save / record dates    | `src/lib/detail/mutations.ts`                       |
| Completion + recurrence moves | `src/lib/tree/mutations.ts`, `src/lib/recurrence/*` |
| Domain meanings               | `agent-os/standards/product/date-model.md`          |
