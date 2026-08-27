# Weekly envelope targets — Shaping notes

**Status: active**

## Scope

A fourth goal-template type, `weekly`, for ordinary spending anchored to a weekday: an amount
and a weekday, whose monthly demand is `amount × occurrences of that weekday in the month`.
Plus the drawer copy that stops "refill" from looking like the right choice for it, and a
history-derived suggestion for the per-occurrence amount.

### Out of scope

- Every-N-weeks, day/month/year periods, and a `starting` date. Nothing needs money every
  other Tuesday. Added when a real category asks for it.
- An `up to` clamp on a weekly line.
- Removing refill from the app. It stays on `simple`, where holding a balance is right.
- A separate "impulse groceries" envelope. Mid-week grocery runs stay in Groceries; they are
  absorbed by the per-occurrence _amount_, not by an extra occurrence.
- Anything for bills. A bill still funds itself from its own cadence.

## Decisions

Recorded in full in `plan.md` as D1–D6. In brief:

1. **`weekly` template type**, weekday 0–6 (Sunday = 0, as `weekdayOfDateKey`), integer cents,
   stored in the existing `templates` JSONB — no migration.
2. **Whole month, always.** Not "occurrences still ahead of today". Underfunded's existing
   `max(0, demand − assigned)` already makes a mid-month run a top-up.
3. **Carry-in never reduces the ask.** The load-bearing claim; gets a test named for it.
4. **Two fields only.** No cadence knobs, no refill clamp. A deliberate divergence from
   Actual's `periodic`.
5. **Suggest the amount from history**, over all category spending, never only the anchor-day
   transactions; no suggestion at all under three months of history.
6. **Rename the two jobs**: "Add every month" / "Amount each Friday" for a contribution,
   "Keep available" for a balance. The words "refill" and "set aside" leave the UI.

## Why the obvious alternatives lose

- **Just fund 4 × the weekly amount and reallocate.** Works until a 5-Sunday month, then
  underfunds by a whole trip and the user has to count days by hand. Counting days is exactly
  what a computer should do.
- **A 12-month monthly average.** Smears 4- and 5-occurrence months together. It is a good way
  to set _dollars per trip_ and a bad way to set _this month's total_ — which is why the
  suggestion (D5) uses history for the former and the calendar for the latter.
- **Refill up to the weekly amount.** Treats an unspent week as evidence of lower demand. It
  is not: an average is an average, and a light week is noise. The leftover's job is to become
  flexible money for whatever runs short next.

The shape of the answer: **calendar for how many units this month, history of the whole
category for dollars per unit.**

## The copy problem, stated plainly

The confusion that started this was never the math — it was the names. "Refill up to" sounds
like the obvious choice for pizza and groceries and is the wrong one. Two different jobs were
wearing adjectives instead of names:

| Job                     | What it means                         | Leftovers                    | Which envelopes               |
| ----------------------- | ------------------------------------- | ---------------------------- | ----------------------------- |
| Add $X this month       | Contribution. This month costs $X.    | Stay put until you move them | Pizza, groceries, bills       |
| Hold $X in the envelope | Balance. Keep about $X sitting there. | Count toward it; ask shrinks | Buffers — car repair, medical |

Fixing this needed both halves: name the jobs (D6) _and_ stop offering the balance job where
it is wrong (D4). Better adjectives on both behaviours in the same drawer is how the confusion
started.

## Context

- **Visuals:** None.
- **References:** See `references.md`. The closest existing code is `occurrencesInMonth` in
  `templates/schedule.ts` (a day-cadence bill summing its charges in a month) — same idea,
  different anchor, and it walks by a day step where a weekday count is closed form.
- **Product alignment:** The Finances envelope budget reimplements Actual Budget; this spec
  keeps Actual's `periodic` _semantics_ and drops its cadence surface (`AGENTS.md`, Actual
  Budget reference).

## Standards applied

Listed with reasons in `standards.md`. The ones that shaped decisions rather than style:
`development/clean-code` (no speculative generality — D4 is that rule applied), and
`development/dates` (weekday of a calendar day must read the UTC-noon encoding, never
process-local `Date`).
