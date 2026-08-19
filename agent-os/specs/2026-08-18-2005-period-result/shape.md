# Period result — Shaping Notes

**Status: active**

## Scope

One number, computed per closed pay period, that answers **"how successful have I been at
living within my means?"** — plus the history of it, and the one distinction that keeps the
number honest.

Delivered surfaces: a panel on `/finances/dashboard` under Available to Spend showing the
last closed period's result, a compact history of the previous ~6, and an "N of 6
self-funded" summary; and a way to mark a savings withdrawal as planned so a saved-for
purchase does not read as a failure.

### Out of scope

- **Savings targets, buffer goals, earmarks, quasi-accounts.** The one-month buffer and
  saving toward a named thing are the roadmap's earmarked-savings item. Explicitly wanted
  by the user, explicitly not here — this spec only distinguishes a planned withdrawal
  from a raid.
- Suggesting or automating the sweep amount. The app scores; the user moves the money.
- Any change to `availableToSpend` itself.

## How the shape was arrived at

The conversation started from a roadmap cleanup and turned into a finding. The 360 Savings
account had an automatic paycheck-percentage transfer of ~$693. Over the 13 months to
Aug 2026 it moved **$20,168.81 in** and **$19,760.49 back out** — net $408 plus $30 of
interest, balance orbiting $1,100–$2,700 and touching **$0.96** once. Of what left,
$11,924 went back to checking and $7,836 went to Capital One card payments.

The user's reading, and the rule that came out of it: the card is simply a way of spending
checking money, paid off in full monthly; many accounts and cards should read as one
checking account; **end the period at zero or better**; and move money to savings only
_after_ a period is survived and the next paycheck has landed. Savings is what survived,
not what was promised. The automatic transfer was cancelled the same day.

The user then asked whether this was just net cash flow. It is not, and the difference is
the whole point — see D1. A flow can be positive while the position is still negative,
which is exactly the case that matters when a card balance is being carried.

**The YNAB failure this avoids.** The user's prior experience: buckets made trade-offs
visible, which worked, but the emergency fund was always the bucket raided to cover an
overage. The current wholesale exclusion of savings from Available to Spend already has
the protecting property — the reserve is simply not offered as a source. This spec keeps
that and adds a score, rather than adding buckets.

**The one refinement the user raised.** A withdrawal for something genuinely saved for (their
example: a handgun) is not a raid, and must not read as one. That is D4/D5 — one explicit
flag, not an inferred one.

## Decisions

Full statements with rationale live in `plan.md` D1–D8. In brief:

- **D1** A position at an instant, not a flow over an interval. This is what separates it
  from `cashFlow().netCents`.
- **D2** Set-asides and recurring-spend holds are deliberately excluded from a backward
  measure; the name **period result** exists so nobody assumes otherwise.
- **D3** Savings stays excluded, so a period rescued from savings is not a success.
- **D4** A withdrawal can be declared planned; planned withdrawals do not disqualify.
- **D5** That flag is explicit, never inferred from `event_label`.
- **D6** Only closed periods are scored; the current one is "in progress", never failing.
- **D7** One place — the Dashboard, under Available to Spend.
- **D8** Historical balances are reconstructed by walking the ledger, following the
  existing `assetDebtSeries` pattern rather than storing snapshots.

### Constraints noted during shaping

- Commitment state is **not versioned**, so the set-aside accrual as of a past date cannot
  be reconstructed. This is a cause of D2, not merely a convenience.
- `balance_after` exists on the bank rows (183/185 checking, 78/80 savings since Aug 2025)
  but on **none** of the card rows, so reconstruction must walk the card ledger and can be
  cross-checked only on the bank side.
- The sign convention from `available.ts` is load-bearing: positive is money in for every
  kind, and a `Math.abs` or unary minus anywhere in the new module would be a bug.
- Real test data already exists — periods that closed on their own and periods rescued by a
  savings pull, including the $1,463 and $2,600 withdrawals.

## Context

- **Visuals:** None. Two ASCII sketches were used to settle the panel's placement and the
  history row; both are described in prose in `plan.md` Task 4.
- **References:** See `references.md`.
- **Product alignment:** Delivers the _measurement_ half of the roadmap's **earmarked
  savings** item in `agent-os/product/roadmap.md` § Financial planning, leaving targets and
  earmarks open. Also serves the premise recorded at the top of that section: many accounts
  and cards should read as one checking account.

## Standards Applied

- **development/clean-code** — arithmetic in `src/lib/finances/periodResult.ts`,
  `actions.ts` stays thin, components never touch the db. `DashboardView` arranges and
  formats only.
- **development/testing** — pure logic gets a sibling test; the new flag's mutation gets an
  integration test with a second user failing to read, change and delete. No React
  component tests.
- **development/security** — the new mutation takes `userId` first and proves ownership.
- **development/dates** — `YYYY-MM-DD` parts throughout, never `Date` for calendar
  arithmetic; `todayKey` supplied by the caller so nothing depends on the deploy region.
- **database/migrations** — generated with its snapshot, never hand-written.
- **components/navigation** — any new command gets a menu entry.
