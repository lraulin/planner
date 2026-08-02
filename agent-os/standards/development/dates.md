# Date and time handling

This app is calendar-day heavy (plans, deadlines, shelves, day pages) with a smaller set
of true instants (created/updated, completion history, appointments). Getting the two kinds
mixed is how completed dates show as the wrong day after a save.

Domain meanings of the four node dates live in `product/date-model.md`. This file is the
**mechanics**: storage, keys, UI, and tests.

Stack: Next.js + TypeScript + Drizzle + Postgres. No date-fns / Day.js / Luxon — keep
helpers in `src/lib/schedule/geometry.ts` and `src/lib/dateMath.ts`.

## Two kinds of value

| Kind             | Means                      | Examples                                                                                                             | Store / compare as                                             |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Calendar day** | A date with no time of day | deadline, deferred, target start/end, actual start, date completed, day page `day`                                   | **UTC noon** of that day in `timestamptz`; key via `toDateKey` |
| **Instant**      | A real moment in time      | `created_at`, `updated_at`, `nodes.completed_at`, `task_completions.completed_at`, appointment `start_at` / `end_at` | `timestamptz`; compare as instants                             |

Never use one kind’s helpers for the other.

## Why UTC noon (not local midnight)

The browser and the server almost always disagree on “local”:

- Laptop in US Eastern picks **Aug 1** → old code stored local midnight → `2026-08-01T04:00:00Z`
- Server in **UTC** ran `startOfDay` → `2026-08-01T00:00:00Z`
- Laptop `toDateKey` with local getters → **Jul 31**

So calendar days are encoded as **UTC noon of the intended `YYYY-MM-DD`**. Then
`toDateKey` (UTC date components) returns the same key on every machine.

“Is it still Tuesday **for me**?” is different — that uses **`localDateKey`** / `useToday`.

## Core rules

1. **Postgres timestamps are timezone-aware** (`timestamptz`).
2. **Calendar fields: `fromDateKey` / `toDateKey` / `asCalendarDay` only.**
3. **Never `new Date("YYYY-MM-DD")`** (UTC midnight) and never process-local
   `new Date(y, m - 1, d)` in shared server/client code.
4. **Never `date.toISOString().slice(0, 10)` ad hoc** — call `toDateKey` (UTC day of a
   calendar encoding) or `localDateKey` (wall clock of an instant).
5. **Bare `YYYY-MM-DD` strings** (day page URLs, day keys) are labels; shift with
   `shiftDateKey` / `daysBetweenKeys`.
6. **Instants stay instants** until display.
7. **No business rule may depend on the server’s `TZ`.** Pass `today: string | null` into
   pure helpers. UI “today” is `localDateKey` on the client.

## Canonical helpers

| Need                           | Use                                                             |
| ------------------------------ | --------------------------------------------------------------- |
| Stored calendar Date → day key | `toDateKey` (UTC components)                                    |
| Day key → stored Date          | `fromDateKey` (UTC noon)                                        |
| Normalize any Date → calendar  | `asCalendarDay`                                                 |
| Wall-clock day of an instant   | `localDateKey`                                                  |
| “Today” in the UI              | `useToday()` → `localDateKey(new Date())` or `null`             |
| Add days/months/years          | `addDays` / … then `asCalendarDay` when writing calendar fields |
| Whole days between keys        | `daysBetweenKeys`                                               |
| Date input                     | `DateField` — `toDateKey` display, `fromDateKey` write          |

## Database

- Prefer `timestamptz` for every timestamp column.
- Calendar-day columns: only the date half is meaningful; writers store **UTC noon**.
- Instant columns store the true moment.
- Record dates (`actual_start_date`, `date_completed`): never in the future; clamp on write.
  See `product/date-model.md`.

## Forms and detail drawer

- `DateField` shows `toDateKey(value)` and writes `fromDateKey(picked)`.
- **Record** fields: `max={localDateKey(new Date())}`; server re-encodes with `asCalendarDay`
  / `recordDate`.
- Completing a task stamps `date_completed` with `asCalendarDay(at)`, not `startOfDay(at)`.

## Display and grids

- Grid date columns: `toDateKey(date)`.
- Overdue / “today” comparisons: day key of the field vs `useToday()` (`localDateKey`).
- Compact labels: `formatCompactDate(toDateKey(date))`.

## Testing

- Calendar fixtures: `fromDateKey("2026-03-08")`, assert with `toDateKey`.
- Do not assert `getHours() === 0` on calendar fields (they are UTC noon).
- Pure helpers take `today: string` — no hidden `new Date()` for business rules.

## Common pitfalls

| Pitfall                                         | Why it hurts               | Do instead                    |
| ----------------------------------------------- | -------------------------- | ----------------------------- |
| `startOfDay` on the server for date completed   | Server TZ rewrites the day | `asCalendarDay(at)`           |
| Local midnight encoding                         | Client TZ ≠ server TZ      | `fromDateKey` (UTC noon)      |
| `toDateKey` via local getters for stored fields | Jul 31 / Aug 2 off-by-one  | UTC `toDateKey`               |
| `localDateKey` for stored deadlines             | Wrong near zone boundaries | `toDateKey`                   |
| `toDateKey(new Date())` for picker max          | UTC “today” on the server  | `localDateKey` in the browser |

## Where things live

| Concern                      | Location                                   |
| ---------------------------- | ------------------------------------------ |
| Day keys, week geometry      | `src/lib/schedule/geometry.ts`             |
| Calendar arithmetic on Dates | `src/lib/dateMath.ts`                      |
| DateField                    | `src/components/detail/fields.tsx`         |
| Today hook                   | `src/components/grid/useToday.ts`          |
| Domain meanings              | `agent-os/standards/product/date-model.md` |
