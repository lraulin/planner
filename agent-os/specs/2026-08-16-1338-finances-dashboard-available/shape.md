# Finances Dashboard — available to spend — Shaping Notes

**Status: frozen / complete** (2026-08-16)

## Scope

A Finances **Dashboard** page answering the forward-looking question the other four pages do
not: what is the current position across every account, and **how much is left to spend before
the next paycheck**.

Three numbers and the lists behind them:

1. **Available to spend** — spendable cash minus card debt minus set-asides, with the day count
   to the next payday.
2. **Cash position** — checking + savings + cash − card debt. The "true net" figure.
3. **Accounts** — every account, its headline balance, and how fresh that number is.

Plus the set-aside primitive: a flag on a declared recurring bill that accrues its cost out of
each paycheck. Rent is the only one flagged today; the mechanism is general.

### Out of scope

- **Envelopes proper.** Multiple funded categories, rollover, reallocation, per-envelope
  spending. This spec builds the primitive and the page they will live on. The roadmap keeps
  Envelopes as **Next** afterwards, and it should — a set-aside is not an envelope, it is the
  one arithmetic an envelope needs.
- **Goals integration**, and AI advice on top of envelope history. Both are downstream of
  envelopes existing.
- **Any scheduled or background sync.** SimpleFIN updates on its own roughly daily cadence and
  offers no forced refresh; a scheduler here would add a moving part that cannot make the data
  newer.
- **Charts.** Insights owns those, and adding a second charting surface would mean two answers
  to every question the two pages share.
- **Changing what Insights, Register, Statements or Orders show.** Only their tab order moves.

## Decisions

- **Card debt is subtracted from the headline.** The alternative — checking minus set-asides,
  with card balances reported separately — is how most people think day to day and is exactly
  wrong in the situation the page exists for. A card charge does not touch checking until the
  statement is paid, so a figure that ignores it overstates by precisely the amount most easily
  overspent. Chosen with the trade-off stated: the number will often be negative, and it must
  render that way rather than clamping at zero.

- **Savings is not spendable.** It is in the cash position and not in available-to-spend. Two
  numbers side by side make the gap visible, which is the useful signal; one number folding
  them together would spend savings without saying so.

- **Pending rows are added only on top of a synced balance.** The single genuine trap in the
  arithmetic. The headline balance is already three-tier, and two of those tiers include every
  row on the account — pending included. An unconditional "subtract pending" double-counts the
  accounts that have pending rows and only those, which is invisible on inspection because the
  result is merely wrong, never missing.

- **Set-asides ride on `finance_recurring_bills`, not a new table.** Two columns on a table that
  already holds merchant, cadence, expected cost and anchor, unique per user per merchant. A
  dedicated table would duplicate all four and create two answers to "what does rent cost" —
  the ambiguity that unique constraint was added to prevent.

- **The set-aside accrues and then clears.** Half of rent per paycheck, capped at the full
  amount, dropping to zero the moment the charge posts. Generalised as
  `round(26 × cadenceMonths / 12)` paychecks per cadence, so a yearly bill accrues over 26 and
  a monthly one over 2 — the user's stated model falling out of the general rule rather than
  being special-cased.

  The rejected alternative, recorded because it looks more careful: hold back the **full**
  amount as soon as the due date is nearer than the next payday. It is arguably the more
  accurate answer to "what must survive", and it makes the headline lurch by a full month's rent
  overnight. A number that jumps is a number that gets ignored.

- **Payday is detected, and correctable.** Detection already exists and is cadence-based, which
  is why it survived two employer changes. It is still retrospective: a job change or a lagging
  sync makes it quietly wrong. The override is cheap; what it buys is that the page can name
  which source it used, so a projected date never reads as a known one.

- **Dashboard becomes the module default.** Status before analysis before detail. The
  known consequence is that an existing session keeps landing on Register until Dashboard is
  visited once, because `moduleEntryRedirect` prefers the remembered page — worth stating so it
  is not later diagnosed as a bug.

- **No new UI primitives.** `Panel`, `StatTile`, `StatRow` and `PanelEmpty` already exist under
  the Insights folder and are finance-agnostic apart from two tone names. Reused as they are;
  moving or generalising them is not this spec's work.

## Context

- **Visuals:** None provided. The layout was agreed in prose during shaping — headline, cash
  position row, accounts, set-asides, and a "what this cannot see" panel.
- **References:** See `references.md`. The load-bearing ones are `2026-08-15-1315-live-bank-sync`
  (which reserved this work and settled how balances and pending rows behave) and
  `2026-08-14-1012-recurring-bill-cadences` (the table being extended).
- **Product alignment:** `agent-os/product/roadmap.md` § Financial planning, "YNAB-like, but
  simpler". Envelopes has been **Next** since 2026-08-12, deferred until real spending data
  existed to design against. This is the first half of that, and deliberately does not claim the
  rest. Achieve Planner had no finance module, so nothing in `docs/achieve-planner/` governs it.

## Standards Applied

- **development/dates** — the day count and the accrual are both calendar arithmetic on a
  reader's local "today". Rule 8 (no business rule depends on the server's `TZ`) is what forces
  `todayKey` to be a parameter and the analysis to run in the client.
- **development/testing** — the whole spec is arithmetic that looks plausible when wrong. Pure
  module with unit tests; the DB touch (two columns, one read) gets integration tests with a
  second user.
- **development/security** — every read and mutation scopes on `userId`; the bank connection's
  access URL must not reach the page.
- **development/clean-code** — logic in `src/lib/**`, components orchestrate. One implementation
  of each rule.
- **database/migrations** — generated, never hand-written; no `db:push`.
- **components/navigation** — one registry for pages; the new tab is a registry entry, not a
  hard-coded link.
- **components/ux-principles**, **components/responsive** — the page is read on a phone first.
