# Date and time handling

This app is calendar-day heavy (plans, deadlines, shelves, day pages) with a smaller set
of true instants (created/updated, completion history, appointments). Getting the two kinds
mixed is how completed dates show as “tomorrow” and shelves expire a day early.

Domain meanings of the four node dates live in `product/date-model.md`. This file is the
**mechanics**: storage, keys, UI, and tests.

Stack: Next.js + TypeScript + Drizzle + Postgres. No date-fns / Day.js / Luxon — keep
helpers in `src/lib/schedule/geometry.ts` and `src/lib/dateMath.ts`.

## Two kinds of value

| Kind             | Means                      | Examples                                                                                                             | Store / compare as                                        |
| ---------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Calendar day** | A date with no time of day | deadline, deferred, target start/end, actual start, date completed, day page `day`                                   | Local midnight `Date` in DB; `YYYY-MM-DD` via `toDateKey` |
| **Instant**      | A real moment in time      | `created_at`, `updated_at`, `nodes.completed_at`, `task_completions.completed_at`, appointment `start_at` / `end_at` | `timestamptz`; compare as instants                        |

Never use one kind’s helpers for the other.

## Core rules

1. **Postgres timestamps are timezone-aware** (`timestamp(..., { withTimezone: true })`).
2. **Calendar days are local.** Reader’s local zone for “today”, form pickers, and day keys.
3. **`toDateKey` / `fromDateKey` are the only Date ↔ `YYYY-MM-DD` bridge** for calendar
   fields. Do not use `date.toISOString().slice(0, 10)` — that is the UTC day and shifts
   after evening in the Americas (and the other way in Asia for local-midnight stamps).
4. **Never `new Date("YYYY-MM-DD")`.** That is UTC midnight. Use `fromDateKey("YYYY-MM-DD")`
   or `new Date(y, m - 1, d)`.
5. **Bare `YYYY-MM-DD` strings** (day page, URL params, pure key arithmetic) may shift with
   UTC date math (`T00:00:00Z` + `setUTCDate`) because they are not instants — they are
   labels. Do not convert those labels through local `Date` getters unless you mean local.
6. **Instants stay instants** until display. Serialize as ISO-8601 with offset/`Z` across
   APIs when you control the wire format.
7. **No business rule may depend on the server’s `TZ`.** Pass `today: string | null` into
   pure helpers (as grids already do) so SSR and client agree.

## Canonical helpers

| Need                         | Use                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| Date → day key               | `toDateKey` (`geometry.ts`)                                  |
| Day key → local midnight     | `fromDateKey`                                                |
| Local midnight of an instant | `startOfDay` (`dateMath.ts`)                                 |
| Add days/months/years        | `addDays` / `addMonths` / `addYears` (`dateMath.ts`)         |
| Whole days between keys      | `daysBetweenKeys` (`geometry.ts`) — pure string arithmetic   |
| Whole days between Dates     | `daysBetween` (`dateMath.ts`) — local calendar days          |
| “Today” in UI                | `useToday()` → `toDateKey(new Date())` or `null` pre-hydrate |
| Date input control           | `DateField` — local display/write, optional `max` / `min`    |

Do not reimplement these inline.

## Database

- Prefer `timestamptz` for every timestamp column (already the Drizzle default here).
- Calendar-day columns still use `timestamptz` but **only the date half is meaningful**:
  writers store **local midnight** for that day.
- Instant columns store the true moment (`new Date()`, completion time, etc.).
- Record dates (`actual_start_date`, `date_completed`): never in the future; clamp on write.
  See `product/date-model.md`.

## Forms and detail drawer

- `DateField` holds a `Date | null` that is local midnight for the chosen day.
- **Record** fields (Actual start, Date completed): `max={toDateKey(new Date())}`; server
  clamps with the same rule.
- **Plan / shelf** fields (target start, deferred, deadline) may be in the future.
- On save, coerce wire values: bare `YYYY-MM-DD` → `fromDateKey`; never trust
  `new Date(isoDateOnly)`.

## Display and grids

- Grid date columns and filters: `toDateKey(date)` for the cell value and sort key.
- Compact labels: `formatCompactDate(toDateKey(date))` — the formatter takes a day key, not
  a `Date`.
- Export filenames may use `toDateKey(new Date())` (local) or a UTC ISO date; be consistent
  within the feature, not mixed.

## API / agent tools

- Instants: ISO-8601 with `Z` or offset.
- Calendar days: prefer `YYYY-MM-DD`. If a full ISO arrives for a calendar field, take the
  **local** calendar day of that instant only when the product means “that moment’s day”;
  for Achieve-style pure dates, parse the date part with `fromDateKey` after validating
  `YYYY-MM-DD`.

## Testing

- Prefer **local midnight** fixtures: `fromDateKey("2026-03-08")` or `new Date(2026, 2, 8)`.
- Assert calendar results with local getters or `toDateKey`, not `toISOString().slice(0, 10)`.
- Pure helpers take `today: string` — no `new Date()` inside them.
- When behaviour depends on “today”, cover a case that would fail under UTC-key confusion
  (e.g. evening local time, or a non-UTC timezone in CI if practical).
- DST: recurrence and `addDays` already pin spring-forward cases; keep that pattern.

## Common pitfalls

| Pitfall                                                   | Why it hurts                     | Do instead                                                           |
| --------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `date.toISOString().slice(0, 10)` for calendar UI         | UTC day ≠ local day              | `toDateKey(date)`                                                    |
| `new Date("2026-08-02")`                                  | UTC midnight                     | `fromDateKey("2026-08-02")`                                          |
| Stamping `date_completed` as `new Date()` with time       | Form shows wrong day             | `startOfDay(at)`                                                     |
| Comparing deferred with `> new Date()`                    | Hides “due today” until midnight | Day-key `>` with `toDateKey`                                         |
| Mixing UTC day keys for `today` with local midnight dates | Shelves / overdue off by one     | `useToday` / `toDateKey` everywhere for calendar logic               |
| Server `TZ` for “today” in mutations                      | SSR ≠ user                       | Pass explicit day key or use local consistently in user-facing paths |

## Where things live

| Concern                      | Location                                   |
| ---------------------------- | ------------------------------------------ |
| Day keys, week geometry      | `src/lib/schedule/geometry.ts`             |
| Calendar arithmetic on Dates | `src/lib/dateMath.ts`                      |
| DateField                    | `src/components/detail/fields.tsx`         |
| Today hook                   | `src/components/grid/useToday.ts`          |
| Domain meanings              | `agent-os/standards/product/date-model.md` |
| Shelving expiry              | `src/lib/tree/shelving.ts`                 |
| Schedule status bands        | `src/lib/tree/status.ts`                   |
