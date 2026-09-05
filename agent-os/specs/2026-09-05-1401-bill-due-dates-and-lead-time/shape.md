# Bill due dates and lead time — Shaping Notes

**Status: active**

## Scope

Give a bill a **due date** as a first-class declared fact, separate from when money actually
leaves the account, and make the app's "this charge never arrived" check read the declared
schedule instead of extrapolating from the last posting.

Concretely: make the existing inert `due_day` column load-bearing, add `lead_days` beside it,
derive charge occurrences from the calendar, and match posted charges to the nearest occurrence.
Then clean out the dead code the investigation surfaced in the same area.

### Out of scope

- **No bill-instance table.** The 2026-08-14 cadence spec's follow-up asked for "a notion of a
  bill instance"; this answers it by derivation. No rows, no stored cursor, no reconciliation
  loop — one-budget D2's objection to a `next_date` cursor still stands.
- **No weekend/holiday solving.** Actual's `skipWeekend` + solve mode was built and deliberately
  retired by one-budget D2. The residual drift after lead days is at most 6 days on real data and
  grace absorbs it. Do not reintroduce it.
- **No change to what the envelope funds.** The budget still funds by charge (posting) month,
  because that is when money leaves. Due date is information, not a funding input.
- **No auto-backfill.** Existing bills keep `due_day = null` and behave exactly as today.
- **Detection does not infer a due day.** Postings do not carry the contract; rent's bank rows
  land anywhere from the 17th to the 31st. The due day is declared by the user. Only the _lead_
  is suggested, and only once a due day exists.
- Not touching the Budget page's four money columns, the funding bars, or assignment.

## Decisions

See `plan.md` D1–D8. The load-bearing ones and why:

- **The occurrence series is calendar arithmetic, not a walk.** This is the whole fix. A walk
  from the last posting absorbs every deviation permanently; a calendar series is self-correcting
  in the way one-budget D2 claimed the walk already was.
- **Nearest-occurrence matching needs no window constant.** The cadence defines the buckets, so
  there is no tolerance number to tune and get wrong. It also answers a question the app could
  not previously answer at all: _which month's rent did this charge pay?_
- **`billAnchor` keeps its signature.** It needs only `lastCharge` — given a calendar series, the
  occurrence nearest the last posting is the satisfied one and the next is outstanding. So the
  Budget page, the target engine, the forward projection and the Upcoming strip all inherit the
  fix without being edited, which is what keeps this from becoming a sprawling change.
- **Grace floor 7, from the data.** Not a guess: 6 days was the worst real lateness against a
  calendar occurrence, and 7 is the smallest floor that produces zero false alarms across 24
  cycles.

### Open question deferred to implementation

D5 removes the ability to type a Next charge date on a bill that declares a due day. The
alternative considered was to keep the cell writable and have a typed date _derive_ the due day
and lead from it. That is cleverer and more surprising; if the read-only cell turns out to be
annoying in use, revisit it as a change row rather than silently allowing two writers again.

## Context

- **Visuals:** None.
- **Trigger:** The app warned that the rent payment had never arrived. It had — it posted
  2026-08-26 for the 2026-09-01 due date, because autopay is set 7 days ahead at the landlady's
  request. The user's words: _"There is no way to set this cadence."_ There was not.
- **Evidence gathered before shaping** (all against the live local database):
  - Rent's stored row: `cadence_months=1, cadence_days=NULL, due_day=NULL, anchor_date=NULL,
expected_cents=210000, scheduled=t`.
  - 24 postings via the `Rent` payee claim, 2024-09-26 through 2026-08-26, day-of-month spanning
    17–31.
  - Current rule replayed: **16 of 24** occurrences flagged, 42 total days on the review list.
  - Proposed rule replayed: **24 of 24** matched, **0** flagged at grace 7 (3 at grace 5, 16 at
    grace 0).
- **References:** See `references.md`.
- **Product alignment:** Finances/envelope budgeting is the active area; this is a correctness
  fix inside it, not a new roadmap item. Check whether the roadmap names the cadence-forecast
  reconciliation line at freeze.

## Standards Applied

See `standards.md`. In short: `development/clean-code` supplies the governing rule (the model is
wrong, so change the model — the two-workarounds signal is present twice over);
`development/dates` governs every line of the new arithmetic; `development/testing` requires the
cross-user integration case on the new column; `database/migrations` governs the schema change.
