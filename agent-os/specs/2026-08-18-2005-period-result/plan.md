# Period result — living within my means, measured

**Status: active**
Spec folder: `agent-os/specs/2026-08-18-2005-period-result/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — the sign
  convention (positive is money in, for every account kind), the wholesale exclusion of
  savings from spendable money, and the decision to let a headline go negative rather than
  clamp it. This spec adds the backward-looking counterpart on the same page and changes
  none of that arithmetic.
- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — pay-period arithmetic and
  the fixed-boundary `periodIndex` convention. Tier 1 and Tier 2 set-asides accrue
  _forward_ against a known charge; D2 below explains why this measure deliberately does
  not use them.
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — payday
  detection, `PayPeriod`, and pay-period bucketing. This spec consumes those buckets; it
  does not change how a period is found.

## Context

Every finance surface today answers either "what happened" (register, insights, statements)
or "what can I spend now" (dashboard). Nothing answers **"how successful have I been at
living within my means?"** — which is the question the user actually wants tracked.

This became concrete on 2026-08-18. The 360 Savings account had been fed by an automatic
paycheck-percentage transfer that moved $20,168.81 in and $19,760.49 back out over 13
months — a net of $408, with the balance touching $0.96 once. The transfer was cancelled
that day, and the remaining balance moved to checking to bring Available to Spend to
exactly zero the day before payday.

The replacement rule the user set for themselves: **spend from checking, put the card
balance in the same picture, end each period at zero or better, and only move money to
savings after a period is survived and the next paycheck has landed.** Savings is what
survived, not what was promised. Dipping into savings is to be treated like going into
debt.

The app can measure that rule instead of leaving it to willpower. It cannot today.

### Why this is not net cash flow

`cashFlow().netCents` (`src/lib/finances/analytics.ts`) is income − spending over an
interval, already bucketed by pay period, with internal transfers paired out. It is a
**flow** and ignores the starting position. It diverges from the rule in three ways:

1. Start a period $300 down, net +$100 → cash flow reports +$100, but nothing survived.
2. A card balance carried in from earlier periods is not in this period's flow, while the
   user's model treats the full card balance as money already spent.
3. It does not know about commitments or savings intent.

What the rule needs is a **position at an instant**: what was actually left at the close of
the period, after everything already owed.

## Decisions

**D1 — The measure is a position, not a flow.** For each closed pay period, evaluate
`checking + cash − card balances` as of the period's last day. Positive means the period
was genuinely self-funded.

**D2 — Deliberately excludes set-asides and recurring-spend holds.** Those are forward
devices that stop you spending money you will need. Looking backward at a closed period,
any bill that was actually charged is already in the balance, and reconstructing the
accrual as of a past date would require commitment history that is not versioned. Naming
matters: call it **period result**, never "Available to Spend as of", so nobody assumes
the holds are in it.

**D3 — Savings is excluded from the position, exactly as in `availableToSpend`.** A period
that only closed positive because money came out of savings is not a success. This is the
same instinct that made the headline allowed to go negative rather than clamped at zero.

**D4 — A withdrawal can be declared planned.** A saved-for purchase (the user's example: a
handgun) is not a raid. A new boolean on the transaction marks it; the existing
`event_label` column names it. Planned withdrawals do not disqualify a period.

**D5 — The flag is explicit, not inferred from `event_label`.** Reusing a non-empty label
as the signal would overload a column that already means "spend event" in
`spendByEvent`/`baselineSplit`, and would let a stray label silently excuse a raid.

**D6 — Only closed periods are scored.** The current period has no result until its payday
lands. A period in progress cannot be judged and must not be shown as failing.

**D7 — Everything on the Dashboard.** The result belongs directly under Available to
Spend: same question, one forward-looking and one backward-looking. No second page.

**D8 — Historical balances are reconstructed, not stored.** Walk the ledger and snapshot at
each period boundary. `assetDebtSeries` in `analytics.ts` already does exactly this walk
for the cash-vs-debt chart; the new function follows that pattern rather than inventing a
second one.

### Out of scope (deliberate, not deferred by accident)

- **Savings targets, buffer goals, earmarks, quasi-accounts.** The one-month buffer and
  saving toward a named purchase are the roadmap's earmarked-savings item and want their
  own shaping. This spec only distinguishes a planned withdrawal from a raid.
- Suggesting or automating the sweep amount. The app scores; the user moves the money.
- Any change to `availableToSpend` itself.

## Acceptance criteria

- [ ] The Dashboard shows the last **closed** pay period's result in dollars, and whether
      it was self-funded.
- [ ] The previous ~6 closed periods appear as a compact history with a "N of 6
      self-funded" summary.
- [ ] A period that closed positive only because of an unplanned savings withdrawal is
      **not** marked self-funded, and says so.
- [ ] Marking that same withdrawal as planned flips the period to self-funded, and the
      label ("Handgun") is visible as the reason.
- [ ] The in-progress period is shown as in progress, never as a failure.
- [ ] Reconstructed balances agree with `balance_after` on the checking and savings rows
      that carry it — verified against the live database, which has it on 183/185 and
      78/80 rows since Aug 2025.
- [ ] A second user cannot read or change the first user's flag through any query,
      mutation, action or agent tool.
- [ ] `npm run smoke` passes with the dev server running.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish
is omitted deliberately.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create the spec folder with `plan.md` (**Status: active**), `shape.md`, `standards.md`,
`references.md`. Record the **Extends** relationships: the dashboard-available spec for the
sign convention and savings exclusion, the commitments spec for pay-period arithmetic, and
the insights spec for pay-period bucketing.

## Task 2: Historical balance reconstruction

New pure module `src/lib/finances/periodResult.ts`, with `periodResult.test.ts` beside it.

- `balancesAt(rows, accounts, dateKey)` — running per-account balance as of a date, walking
  the ledger the way `assetDebtSeries` already does. Reuse `bucketRows` and the
  `applyRow`/running-map pattern rather than duplicating it.
- `periodResults(rows, accounts, periods, todayKey)` — one result per closed period:
  `endKey`, `resultCents` (checking + cash − cards), `savingsWithdrawnCents`,
  `plannedWithdrawnCents`, `selfFunded`.
- Sign convention is inherited and load-bearing: positive is money in, for every kind. No
  `Math.abs`, no unary minus (`available.ts` header).
- All arithmetic on `YYYY-MM-DD` parts; `todayKey` supplied by the caller
  (`development/dates`).

Tests must cover: a period positive on its own; a period positive only via a savings
withdrawal; the same period with the withdrawal marked planned; a period with no payday;
and the in-progress period returning no result.

## Task 3: The planned-withdrawal flag

- Generated migration adding a boolean to `finance_transactions`, default false
  (`database/migrations` — generated with its snapshot, never hand-written).
- Mutation in `src/lib/finances/mutations.ts` taking `userId` first and proving ownership,
  following the existing `excludeFromBaseline` + `eventLabel` edit at
  `mutations.ts:405`.
- Extend `mutations.integration.test.ts` with a second user failing to read, change and
  delete.

## Task 4: Dashboard panel

- Query in `dashboardQueries.ts` supplying the ledger rows and accounts the new module
  needs.
- Panel under Available to Spend: the last closed period's result, the compact history of
  the previous ~6, and the "N of 6 self-funded" line. When a period is not self-funded,
  name the withdrawal that disqualified it.
- `DashboardView` arranges and formats only; every figure computed in
  `src/lib/finances/` (`development/clean-code`).

## Task 5: Marking a withdrawal from the UI

The checkbox and optional label on a savings withdrawal, reachable from where the user
will actually be — the register row, following the existing event-label editing pattern.
Any new command gets a menu entry (`components/navigation` — a command without a menu is
not shipped).

## Task 6: Verify, freeze spec, update roadmap

- `npm run lint`, `typecheck`, `test:unit` (confirm the DB tests actually ran), `build`.
- **`npm run smoke` with the dev server up** — `src/app/**` changes, and nothing else in
  the gate evaluates a `"use server"` module.
- Walk the acceptance criteria against the live database: the real savings withdrawals
  since Aug 2025 give immediate test data, including the $1,463 and $2,600 pulls.
- Complete **Changes from original plan**, mark **Status: frozen / complete**, and update
  `agent-os/product/roadmap.md` § Financial planning — this partially delivers the
  earmarked-savings item's measurement half while leaving targets and earmarks open.

## Verification

Beyond the gate: with the dev server running, open `/finances/dashboard` and check the
last closed period against the register by hand. The live data already contains both cases
— periods that closed on their own, and periods rescued by a savings pull — so the panel
can be confirmed against known history rather than fixtures.

---

> **Standing rule while this spec is active:** when a material change lands on
> requirements, design or scope — including feedback on what was actually built — update
> the relevant section above and append a row to **Changes from original plan**. Skip pure
> implementation details. Freeze when verified.
