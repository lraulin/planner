# References for Achieve-parity recurrence

## The prior slice

- **`agent-os/specs/2026-07-31-0834-task-recurrence/`** — frozen the same day. Read its
  Context for _why_ recurrence defers rather than deadlines; that argument is unchanged and
  is the reason the feature exists. Its "recurrence drives `deferred_date` only" decision is
  the one this delta narrows.

## Source material

- **Achieve Planner manual §3.9**, as quoted by Lee: date recurrence patterns "follow a
  fixed pattern of dates, similar to a recurring appointment"; regeneration patterns "are
  calculated based on the date the current instance is completed". Also documents
  hierarchical copying, Lead Times (§3.9.5) and Skip Recurrence (§3.9.4).
- **`screenshots/recurrence/`** — the four Recurrence dialog tabs (Daily, Weekly, Monthly,
  Yearly), each showing its Regenerate radio alongside the pattern radios, plus the Range
  box; and a regenerating item's General tab showing Target Start and Deferred Date both
  set to completion + 1 day with Deadline left as None.

## Code to borrow from, and code to leave alone

### Appointment recurrence — still a near miss

- **Location:** `src/lib/schedule/recurrence.ts`, `src/components/schedule/AppointmentDrawer.tsx`
- **Shares:** the `recurrence_frequency` and `recurrence_end` enums, the `smallint[]` weekday
  array, the "until is inclusive of its own day" reading, and the week-anchoring rule for
  intervals above 1 (`recurrence.ts:141-146`).
- **Do not unify.** `expandRecurrence` returns every occurrence overlapping a window from a
  fixed series start; this engine returns the one date after a cursor that moves on every
  completion. Its fast-forward paths and occurrence tally carry a fixed bug (`:161-168`)
  that a rewrite would risk. Shared _arithmetic_ lives in `src/lib/dateMath.ts` and in
  `nthWeekdayOfMonth` / `nextWeekdayOnOrAfter`.
- `AppointmentDrawer.tsx:446-500` already hand-rolls a weekday row and end-condition radios.
  `RecurrenceFields` is the cleaner version; migrating the appointment drawer onto it needs
  their schema widened first.

### Google Calendar is a wire format

- `src/lib/google/mapping.ts:203-205` — `toRRule` emits only FREQ/INTERVAL/BYDAY/COUNT/UNTIL
  and never parses an arbitrary RRULE back. Any new pattern column added to `appointments`
  would be silently lost on write-back. Task columns live on `task_details`, which Google
  sync never touches.

## Conventions followed

- **Local calendar days at midnight**, matching `DateField` (`fields.tsx:343-373`), which
  writes `new Date("YYYY-MM-DDT00:00:00")`.
- **Pure date logic, `Date` in and `Date` out, no `new Date()`** — the contract
  `src/lib/tree/status.ts` and `src/lib/chooser/dates.ts` already keep.
- **`database/migrations`**: generate, read the SQL, migrate, commit the `.sql`, the snapshot
  and the `_journal.json` entry together.
