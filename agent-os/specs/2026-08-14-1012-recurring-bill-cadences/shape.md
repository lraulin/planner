# Declared recurring bills — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

A bill that arrives once or twice a year is a real, ongoing cost, and the app currently has
no way to say so. Two of Lee's actual bills prove it:

- **TAYLOR GAS HEATING AIR** — propane, billed semi-annually
- **GEICO** — car insurance, billed semi-annually

Both land on the one-off review list, where the only dispositions are "exclude from
baseline" (which understates the year, a little more confidently each year) and "leave it",
which means the row is still there next window, and the window after that.

This work adds a **third disposition**: declare the merchant a recurring bill on a stated
cadence. That declaration is durable, merchant-level, and drives four things — the review
list stops offering the row, the recurring panel shows what a year of it costs and what to
set aside monthly, the baseline can level it across the months it covers, and an upcoming
panel says when the next one lands.

### Out of scope

- **Envelopes / sinking-fund accounts.** The set-aside figure is a number to read, not a
  balance the app maintains. Envelopes are still the next Finances spec.
- **Reconciling a forecast against the charge that arrives.** The upcoming panel projects
  from history; it does not mark a bill "paid" or alert when one is late. That needs a
  notion of a bill instance, which is its own design.
- **Auto-declaring anything.** Detection proposes; the person disposes. This is the founding
  rule of the one-off flow and it survives intact.
- **A per-user category rules engine.** Taylor Gas gets a code-level classifier rule like
  every other utility. Cadence and category stay separate concerns.

## Decisions

- **Merchant, not transaction, is the unit.** A cadence is a fact about Geico, not about the
  March charge. Keyed on `effectiveMerchant()` so one declaration covers all history and all
  future imports — which is precisely what makes the row stop coming back.
- **Months, not days.** "Semi-annual" means March and September, not every 182.5 days. Days
  drift; months make the next-due date exact and the label honest.
- **Both effects, each labelled.** Lee asked for both the amortized view and the actuals,
  with it clear which is showing. The commitments table (annual cost + monthly set-aside) is
  always visible and never touches actuals. The amortization rides the **existing** "Level
  bills" checkbox, which today only reaches the cash-flow chart; this work extends it to
  `baselineSplit` so the tile and the chart stop disagreeing, and changes the tile's own
  label when it is on.
- **Detection widened only to propose.** `recurringMerchants` keeps its ≥6-charge, ≤100-day
  guard for what it asserts on its own. A separate, looser `longCadenceCandidates` runs only
  to pre-fill a confirmation, where a false positive costs a dropdown change rather than a
  wrong number.

## Context

- **Visuals:** None provided. The commitments-table sketch and the two tile labels in
  `plan.md` were confirmed during shaping.
- **References:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` (governing);
  `src/lib/finances/analytics.ts`, `src/components/finances/insights/`. See `references.md`.
- **Product alignment:** Finances insights is a shipped roadmap item; this is a gap in it,
  not a new area.

## Standards Applied

See `standards.md`. In short: clean-code's app → components → lib → db direction (the cadence
math is a pure lib module, not component logic); testing's rule that anything touching the
database gets an integration test with a second user who fails at everything; migrations
generated, never hand-written; dates' calendar-day discipline, which is load-bearing here
because month arithmetic on a `date` column is exactly where `startOfDay` bites; and
responsive's 16px input rule for the new cadence select on the phone.
