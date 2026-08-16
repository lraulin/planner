# Commitments — subscriptions/bills and recurring spend

**Status: active**
Spec folder: `agent-os/specs/2026-08-16-1938-commitments/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` —
  available-to-spend arithmetic, per-paycheck set-aside accrual, payday detection.
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — merchant
  normalization, the baseline/lumpy split, recurring detection by variance.
- **Extends:** `agent-os/specs/2026-08-14-1104-unscheduled-bills/` — `scheduled` stays
  orthogonal to `set_aside`; the propane case is unaffected by anything here.
- **Supersedes:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` — its
  **`unique (user_id, merchant)` identity decision only**, because `merchant` conflated the
  display name with the join key to transactions. Cadence-in-months, propose-never-apply,
  the review-list suppression and the levelling behaviour all stand unchanged.
- **Supersedes:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — its
  scoping of set-asides to **declared bills only**, extending the same deduction to Tier 2.
  Every other decision in that spec stands.

## Context

The Finances dashboard answers "how much can I spend before payday" by subtracting declared
bills from cash (`src/lib/finances/available.ts`). Two things make that number wrong and the
workflow around it high-maintenance:

1. **`finance_recurring_bills.merchant` does three jobs at once** — display name, unique key,
   and the join to transactions. So `1PASSWORDTORONTOON` cannot be renamed, Pizza Hut and
   Domino's cannot share one entry, and Taylor Gas needed a `classify/rules.ts` entry purely
   to collapse two bank spellings. The UI compounds it: `RecurringTable.tsx` exposes only the
   cadence dropdown for a scheduled bill, so 1Password shows a median-derived **$38.03**
   against a real **$71.88/yr** and there is no way to correct it — even though
   `expected_cents`, `anchor_date` and `due_day` have existed as columns since 2026-08-14.
2. **Available-to-spend subtracts bills but not the groceries and pizza that are certainly
   coming.** The headline is optimistic by a few hundred dollars a week, which is the one
   way this page can fail: being wrong in the comfortable direction.

There is also no status anywhere. Disney+, Paramount+, HBO Max and Nexus Mods are cancelled
or were never activated, and the app still counts every one of them.

Roadmap `agent-os/product/roadmap.md` § Financial planning reads **`Next: Envelopes`**,
deferred 2026-08-12 "until there is real spending data to design them against". This delivers
that item — under the name **Recurring spend**, because envelopes as YNAB teaches them is
explicitly not what is being built here (see D0).

## D0 — The model: three tiers, one of them a deliberate non-feature

| Tier                        | What it is                                                        | Maintenance                      | Why it exists                                     |
| --------------------------- | ----------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| **1 — Subscriptions/bills** | Charges **unless you cancel**. Exact amount, exact date.          | The list; the app watches it     | Money that leaves whether or not you are watching |
| **2 — Recurring spend**     | Pizza, groceries. Cadence known, **you choose it**, amount fuzzy. | Near zero — derived from history | Otherwise Available to Spend lies by ~$270/week   |
| **3 — Everything else**     | Clothes, games, books.                                            | **None. No bucket. Ever.**       | It is already one number: **Available to Spend**  |

**Tier 3 being a non-feature is the design, not an omission.** Per-category discretionary
envelopes encode a decision the user already makes correctly on the fly — "money's tight, I
should hold off" — and in exchange add reconciliation work and no information. This is the
part of YNAB the user identified as busywork, in their own words: a bucket for clothes, a
bucket for games, a bucket for books, all of it arbitrary. **Tier 2's admission test is the
cadence:** if you cannot state one, it belongs to Tier 3 and gets no bucket.

Tier 1 and Tier 2 have **opposite defaults** — a subscription is a liability with an off
switch, recurring spend is a choice that costs nothing unless you make it. That asymmetry is
why they get two tables and two grids, and why only Tier 1 carries cancellation state.

## Decisions

**D1 — Two tables, one shared arithmetic module.** `setAsideHeld()` (`available.ts:301`) is
already a pure function over a plain shape, so both tables feed it without sharing storage.
The DRY argument for one table was weaker than it first appeared: sharing the _math_ never
required sharing the _row_. Drift is prevented instead by both tables projecting into one
`Commitment` view type consumed by the dashboard and the Commitments page, so no accrual
arithmetic is written twice.

**D2 — Identity splits from matching.** Both tables carry `name` (user-chosen, unique per
user) and `matchers text[]` (bank merchant strings as `effectiveMerchant()` produces them).
`finance_recurring_bills.merchant` is dropped, backfilled as `name = merchant` and
`matchers = ARRAY[merchant]`. This one change fixes the 1Password rename, the Pizza
Hut/Domino's grouping, and the Taylor Gas two-spelling problem together — they were always
the same bug.

**D3 — A merchant string belongs to at most one commitment, across both tables.** Not
expressible as a SQL constraint spanning two tables, so it is enforced in the mutation —
claiming a matcher another commitment already holds is an error that names the holder — and
pinned by an integration test. Without it, pizza is counted twice and every figure built
downstream is quietly wrong.

**D4 — "Either/or" needs no special logic.** Whether Friday was Domino's or Pizza Hut is not
a question worth answering, and a rule enforcing "one or the other, never both" would be
inventing a constraint the data does not have. Sum the group per period and take the median
across periods; two pizzas in one week correctly reads as a higher rate rather than as an
error.

**D5 — Tier 2's amount is auto from history, pinnable.** `amount_source` is `'auto'` or
`'pinned'`. Auto is the median of per-period totals across the matcher group over a
26-period lookback (a module constant, not a column), recomputed on read so it tracks
reality with no user action — pizza gets more expensive and the number follows. Pinned
stores `expected_cents` and still displays what history says beside it, so intent ("cut
pizza to $40/wk") is expressible and cannot go stale silently. Auto is the default because
this tier only stays worth having if it is close to zero-maintenance.

**D6 — The Tier 2 held formula, and why it is not the bill accrual.** `setAsideHeld` accrues
_toward_ a future charge and assumes cadence ≥ pay period. A weekly rate against biweekly
pay inverts that relationship, so it needs its own formula. Held is summed over the periods
between today and the next payday:

```
held = Σ over periods p in [today, nextPayday):
         current period      → max(0, rate − spentInPeriod)   // whole rate, not pro-rated:
                                                              // pizza is a lump, not a trickle
         whole future period → rate
         period straddling   → rate × daysBeforePayday / periodDays
           the payday
```

This produces the requested overspend behaviour **with no extra machinery**. Weekly $60, 14
days to payday: held $120. Order a $95 pizza → balance −$95, the current period's held
becomes `max(0, 60 − 95) = 0`, total held $60, so Available moves by exactly **−$35** — the
overage and nothing else. The `max(0, …)` clamp is the whole mechanism: budgeted spend is
free because it was already held, and only the overage bites. Report-only and roll-forward
alternatives were considered and rejected; both need _more_ code than the behaviour we want.

**D7 — Tier 2 changes nothing in Insights.** Pizza is already in the baseline as ordinary
spend; accruing it again in `baselineSplit` would double-count it. Tier 2 is a _view_ on
baseline spend and affects only the Dashboard's held figure. Tier 1 levelling is untouched.
Pinned by a test rather than left as a comment, because this is exactly the kind of
invariant that drifts without anyone noticing.

**D8 — Dead-subscription detection flags, never applies.** An active scheduled bill whose
next due date has passed by more than `max(5 days, 10% of cadence)` with no matching charge
since the prior due gets `expected $X on {date} — nothing posted. Still active?`, offering
**Still active** (re-anchors the walk) and **Cancelled** (sets status and `cancelled_on`).
This is the check that catches Disney+, Paramount+, HBO Max and Nexus Mods. Same
propose-never-apply rule the 2026-08-14 specs established.

**D9 — Status is `active | cancelled | ignored`.** Cancelled keeps the history and stops
accrual and forecasting; **ignored** means "detection proposed this and it is not a
commitment at all", and suppresses it from the review list permanently. Three states because
two would force a cancelled subscription and a mis-detected one into the same bucket, and
they mean different things a year later.

**D10 — One page, two sections.** `/finances/commitments`, second in the Finances nav:
Dashboard, **Commitments**, Insights, Register, Statements, Orders. Built on the shared
`DataGrid` per `components/data-grid`, not a hand-rolled table like `RecurringTable.tsx`.
One page because the forward view needs both tiers and would otherwise have no home; two
sections because pizza must never appear in a list of things that charge you automatically.

## Acceptance criteria

- [ ] 1Password can be renamed from `1PASSWORDTORONTOON`, its amount corrected from the
      derived **$38.03** to the real **$71.88**, and its next charge set to **2027-03-30**.
      It then reports **$5.99/month** set aside.
- [ ] Paramount+ and Disney+ can be marked cancelled and leave every total, while remaining
      visible as history.
- [ ] A commitment named "Pizza" holds both `PIZZA HUT` and `DOMINOS` as matchers and
      reports **one** weekly rate derived from their combined history.
- [ ] Taylor Gas's two bank spellings resolve through matchers rather than needing a
      `classify/rules.ts` entry to do it.
- [ ] Spending $95 in a week against a $60/wk recurring-spend entry moves Available to Spend
      by exactly **−$35**. Pinned by a test.
- [ ] Declaring any Tier 2 entry leaves `baselineSplit` and the cash-flow chart numerically
      unchanged (D7). Pinned by a test.
- [ ] Assigning a merchant already claimed by another commitment fails with an error naming
      the holder, across both tables (D3). Pinned by an integration test.
- [ ] The forward view shows March 2027 as materially above the 12-month median, from the
      1Password renewal alone.
- [ ] An agent can list unclaimed candidates, then create and update commitments through the
      MCP tools, and a second user's identity cannot read or write any of it.
- [ ] A second user cannot read, change or delete the first user's rows in **either** table
      through any new query, mutation, action or agent tool.
- [ ] `npm run smoke` passes with the dev server running, including the new route.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish
is omitted deliberately.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**), `shape.md`, `standards.md`,
`references.md`.

## Task 2: Schema and migration

`src/db/schema.ts`, then `npm run db:generate` — never hand-write a migration without its
snapshot (`database/migrations`).

`finance_recurring_bills` gains `name text not null`, `matchers text[] not null`, `status`
(`active | cancelled | ignored`, default `active`), `cancelled_on date`, `cancel_url text
default ''`. Backfill `name = merchant` and `matchers = ARRAY[merchant]`, then drop
`merchant` and its unique index and add `unique (user_id, name)`. `cadence_months`,
`scheduled`, `expected_cents`, `anchor_date`, `due_day`, `set_aside` and `notes` all keep
their current meanings.

`finance_recurring_spend` is new: `id`, `user_id`, `name`, `matchers text[]`, `period`
(`week | month`), `amount_source` (`auto | pinned`), `expected_cents` (null when auto),
`set_aside bool default true`, `active bool default true`, `notes`, timestamps, unique
`(user_id, name)`.

Every column carries a comment saying _why_ it exists, in the style of the surrounding
schema.

## Task 3: Matching and the shared commitment view

New `src/lib/finances/commitments.ts` with `commitments.test.ts` beside it:

- `matcherIndex(bills, spend)` → `Map<merchant, { kind, id, name }>`, raising D3's collision.
- The `Commitment` view type both tables project into.
- `recurringSpendRate(rows, matchers, period, todayKey)` — D5's median-of-period-totals over
  the 26-period lookback, returning the rate plus the observed range and period count so the
  UI can show its work, and the modal day-of-week for display (derived, never stored).
- `staleSubscriptions(bills, rows, todayKey)` — D8.

Replace the `declared` Set at `dashboardQueries.ts:182` and every `effectiveMerchant`
equality check in `analytics.ts` / `insightsAnalysis.ts` with the matcher index. Reuse
`effectiveMerchant()` (`analytics.ts:112`) and `annualCents` / `nextDueFrom` /
`shiftDateKeyMonths` (`recurringBills.ts`) rather than reimplementing any of them.

## Task 4: Available to spend

`src/lib/finances/available.ts` with `available.test.ts`. Add `recurringSpendHeld()`
implementing D6 exactly; leave `setAsideHeld()` alone for Tier 1. Both feed the existing
`setAsideCents` subtraction and are reported as two labelled lines. Tests pin the −$35
overspend trace, the clamp at zero, the straddling-period pro-rate, and money conservation.

## Task 5: Mutations, actions, ownership

`src/lib/finances/mutations.ts` — generalize `upsertRecurringBill` to the new shape; add
`upsertRecurringSpend`, `deleteCommitment`, `setSubscriptionStatus`. Each takes `userId`
first and proves ownership before writing (`development/security`).
`src/app/finances/actions.ts` stays a thin wrapper.

`mutations.integration.test.ts` and `crossUserReads.integration.test.ts`: a second user must
fail to read, change and delete the first user's rows in **both** tables, and D3's
cross-table matcher collision is pinned here. Check for the Postgres-down skip warning — a
green `test:unit` does not mean these ran.

## Task 6: Commitments page

`src/app/finances/commitments/page.tsx` and
`src/components/finances/commitments/CommitmentsView.tsx`, two `DataGrid` sections.
Registered in `src/lib/navigation/pages.ts` second, after Dashboard, with `pages.test.ts`
updated and commands added per `components/navigation` — a command without a menu is not
shipped.

- **Subscriptions & bills** — name, next charge, amount, cadence, status, annual cost,
  monthly set-aside, matchers, cancel URL, all inline-editable. This is where the 1Password
  correction gets made. Column totals for monthly and annual commitment.
- **Recurring spend** — name, matchers, period, rate (marked `auto` or `pinned`, with the
  history it derives from), weekly and monthly cost.

Creating an entry offers a multi-select of detected-but-unclaimed merchants, so "Pizza" is
one action that takes both Pizza Hut and Domino's.

## Task 7: Twelve-month forward view

On the Commitments page. Project every active scheduled Tier 1 bill forward 12 months with
`nextDueFrom` / `shiftDateKeyMonths`, plus Tier 2 as a per-month rate. Group by calendar
month **and** by pay period, reusing the existing payday detection. Show the running total
and mark months materially above the 12-month median, so an annual charge is visible seven
months out. Unscheduled bills (`scheduled = false`) contribute to monthly cost but get **no
dated row** — the 2026-08-14 rule that a projected date reads as knowledge however it is
captioned.

## Task 8: Dashboard panels

`DashboardView.tsx` — split the "Set aside" panel into **Bills** and **This period**, the
latter showing `spent / rate` per entry, what is left, and over-by in the honest direction.
Add the D8 stale-subscription prompt. `DashboardView` arranges and formats; every figure is
computed in `src/lib/finances/`.

## Task 9: Agent/MCP write tools

`src/lib/agent/contracts.ts` and `financeTools.ts`, following the existing `create_node` /
`update_node` pattern and `api/agent-tools` — strict schemas, intent-shaped descriptions,
compact output, retry-safe where safe:

- `list_commitments` — both tables, with next due and annual cost
- `list_commitment_candidates` — detected recurring merchants not yet claimed, which is what
  makes the paste-a-list-to-an-AI workflow work at all
- `upsert_subscription`, `upsert_recurring_spend`, `delete_commitment`

Extend `financeTools.integration.test.ts` and `toolContracts.integration.test.ts` with a
cross-user case — these are the first finance **writes**.

## Task 10: Insights wiring

`RecurringTable.tsx` and `OneOffReview.tsx` — declaring routes into the new model and offers
both "Track as bill" and "Track as recurring spend". Cancelled and ignored entries suppress
permanently. Confirm D7 holds with a test.

## Task 11: Verify, freeze spec, update roadmap

- `npm run lint`, `typecheck`, `test:unit` (confirm the DB tests actually ran), `build`.
- **`npm run smoke` with the dev server up** — `src/app/**` changed, and nothing in the gate
  evaluates a `"use server"` module.
- Walk the acceptance criteria against the live database in the running app.
- Complete **Changes from original plan**, mark **Status: frozen / complete**, and update
  `agent-os/product/roadmap.md` § Financial planning — this closes the outstanding
  **envelopes** MVP item.

---

> **Standing rule while this spec is active:** when a material change lands on requirements,
> design or scope — including feedback on what was actually built — update the relevant
> section above and append a row to **Changes from original plan**. Skip pure implementation
> details. Freeze when verified.
