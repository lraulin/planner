# Declared recurring bills — annual and semi-annual cadences

**Status: frozen / complete** (2026-08-14)
Spec folder: `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`
- **Supersedes:** that spec's **One-offs** decision — "a per-transaction flag, candidates
  auto-suggested, never auto-applied" gains a **third disposition**. A charge can now be
  declared a recurring bill on a long cadence instead of only being excluded or ignored.
  The "never auto-applied" half is preserved: declaration is always a confirmation.

## Context

Two real bills have no correct answer in the app today:

- **TAYLOR GAS HEATING AIR** — propane, billed semi-annually
- **GEICO** — car insurance, billed semi-annually

Both are structurally invisible to `recurringMerchants` (`analytics.ts:926`), which requires
**≥6 charges** (`MIN_RECURRING_CHARGES`) at a cadence of **6–100 days** (`MAX_CADENCE_DAYS`).
A semi-annual bill is over the day cap and would need three years of history to reach six
charges; an annual bill would need six years. So they fall through to `oneOffSuggestions`
(`analytics.ts:1006`), where `OneOffReview.tsx` offers exactly two outcomes:

1. **Exclude from baseline** — wrong, and wrong in a compounding way. The panel's own doc
   comment already says so: "excluding it every year would quietly understate what a year
   costs — the kind of error that gets more confident the longer it runs."
2. **Leave it** — so it sits on the review list forever, and comes back every window.

The missing concept is a **user-declared bill cadence**. It is a durable fact about a
merchant, not about one transaction, which is why no existing column can hold it.

## Decisions

| Topic                       | Choice                                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the declaration lives | New table `finance_recurring_bills`, unique on `(user_id, merchant)`. Keyed on **effective merchant** (`effectiveMerchant()`, `analytics.ts:101`) so one declaration covers every past and future charge — Geico is declared once, not once a year.               |
| Cadence unit                | `cadence_months` smallint (1, 2, 3, 6, 12…), **not days**. "Semi-annual" is a calendar fact: Mar and Sep, not 182.5 days. Months make the next-due date exact rather than drifting.                                                                               |
| Detection                   | Widened to **propose**, never to apply. `cadenceCandidates()` (in `analytics.ts`) spots ≥2 similar-sized charges whose median gap sits within 12% of a standard cadence, and pre-fills the review row. Confirmation is still required — the founding rule stands. |
| Effect on the numbers       | **Both**, and labelled. See below.                                                                                                                                                                                                                                |
| Forecast                    | Each declared bill carries a next-expected date and amount, surfaced in an **Upcoming bills** panel.                                                                                                                                                              |
| Categories                  | Add a `taylor-gas` entry to `classify/rules.ts` (→ Utilities, "Taylor Gas") alongside the existing SMECO / St Mary's Water entries. Cadence and category stay separate concerns.                                                                                  |

### What the numbers do, and how the app says so

You asked for both effects with it clear what is going on. Two figures, two labels, one
existing control:

**1. Always visible — a commitments table that never lies about actuals.** Declared bills
join the Recurring panel with their annual cost and a monthly set-aside:

As built, on the real data:

```
Recurring charges
  Merchant             Every          Charge      A year    Set aside
  Rent                 Monthly     $2,100.00  $24,725.81   $2,060.48
  ▸ Geico              Every 6 mo    $594.98   $1,189.96      $99.16
  ▸ Taylor Gas         Every 6 mo    $335.83     $671.66      $55.97
                                                ▸ = declared by you
```

**2. Behind the existing "Level bills" checkbox — the bills accrued into the baseline.** That
toggle already exists (`InsightsView.tsx:330`) and already spreads recurring charges across
the buckets they cover via `allocateAcross` (`analytics.ts:452`), but it reached only the
cash-flow chart and only cadences ≤100 days. This work gives the chart the declared long
cadences too, and gives `baselineSplit` its own levelling — **by accrual, not by the chart's
redistribution**; see change 1 below for why they had to differ.

The clarity requirement is met by labelling, following the precedent already set by the
chart subtitle at `InsightsView.tsx:414`:

- Toggle **off** → `Baseline burn per pay period` / "Ongoing spend only, as posted, over 17
  pay periods. A semi-annual bill lands whole in its own pay period; tick 'Level bills' to
  spread it."
- Toggle **on** → `Baseline burn per pay period (levelled)` / "Ongoing spend over 17 pay
  periods, with bills accrued at their cadence — $1,317.12 a pay period of them, whether or
  not a charge landed here. Untick 'Level bills' for what actually posted."

The set-aside column is the same arithmetic shown as a plan rather than as a measurement,
so the two panels reconcile by inspection.

## Acceptance criteria

All verified against the live database and the running app on 2026-08-14.

- [x] Declaring Geico semi-annual removes it from the one-off review list permanently, and
      the next Geico charge imported never appears there either. Confirmed in the app; the
      window-independence of the suppression is pinned by a test, because a declared bill
      with no charge in the window is absent from the recurring table and the suppression
      must not depend on that table having produced a row.
- [x] The same for Taylor Gas, which also now resolves to the merchant "Taylor Gas" —
      collapsing the two bank spellings on file, `TAYLOR GAS COMPANY INC.` and `TAYLOR GAS
    HEATING AIR`, into one declaration. The Utilities category lands on the next
      **Reclassify**; `effectiveCategory` reads the stored `derivedCategory` rather than
      re-running the rules, so the rule change is not retroactive on its own.
- [x] The review row for Geico arrives **pre-filled** with "Every 6 months" from the two
      charges already in history, and is still a confirmation, not an application.
- [x] Both bills appear in the recurring panel marked ▸, with annual cost and monthly
      set-aside: Geico $594.98 → $1,189.96/yr, $99.16 a month; Taylor Gas $335.83 →
      $671.66/yr, $55.97 a month.
- [x] With "Level bills" on the tile reads **Baseline burn per pay period (levelled)**,
      $2,580.20, naming $1,317.12 a period of accrued bills "whether or not a charge landed
      here". With it off it reads **Baseline burn per pay period**, $2,521.10, "as posted".
      Both states say which one is showing.
- [x] Total money is conserved: for a window fully containing a cadence, levelled and
      as-posted baseline sums agree to the cent. Pinned by a test.
- [x] The **Upcoming bills** panel names each declared bill's next expected date and amount,
      walking past a stale anchor — Taylor Gas last landed 10/24/2025 and is reported due
      10/24/2026, not four months overdue.
- [x] A second user cannot read, change or delete the first user's declared bills through
      any new query, mutation or action. Covered by `mutations.integration.test.ts` and
      registered in `crossUserReads.integration.test.ts`.
- [x] `npm run smoke` passes with the dev server running — all 51 routes.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The baseline levels by _accrual_, not by the chart's redistribution.** `cashFlow` moves a charge between buckets and preserves the window total; `baselineSplit` instead contributes each bill's _rate_ — `annualCents × windowDays ÷ 365` — and drops the charges it replaces. | The plan said the two would agree. Redistribution normalises over the buckets present, so a $1,412 premium in a three-month window still counted $1,412 — the exact distortion the feature exists to remove. Accrual makes the tile mean "what an ongoing month costs" and makes it reconcile with the Set aside column by inspection. They now agree exactly over a window holding a whole cadence and differ only on a partial one, which is pinned by a test. |
| 2   | **A second entry point: "Declare a bill" in the recurring panel.**                                                                                                                                                                                                                | Found in verification against the real data. Taylor Gas is $335 a delivery and never clears the one-off list's $500 floor, so the review row the whole flow hung off never appeared — the headline example was unreachable through the only path built. The panel now takes any merchant in the history plus a cadence.                                                                                                                                          |
| 3   | **A "It's a bill" button instead of declaring on select change.**                                                                                                                                                                                                                 | Also found in verification. When the cadence arrives pre-filled — the case the proposal exists for — picking the already-selected option fires no change event, so a proposal was the one row nobody could accept.                                                                                                                                                                                                                                               |
| 4   | **A declared bill's amount is read from the whole history, not the window** (`recurringMerchants` takes an optional third row set).                                                                                                                                               | A commitment does not depend on the window. Taylor Gas's last delivery predates a trailing-12 window, so the row vanished from the commitments table exactly when someone narrowed the range.                                                                                                                                                                                                                                                                    |
| 5   | **`upsertRecurringBill` writes only the fields supplied**, matching `updateTransaction`.                                                                                                                                                                                          | Correcting a cadence from the recurring table sends the cadence alone; a blanket write cleared the declared amount, after which the bill's figure silently fell back to a median.                                                                                                                                                                                                                                                                                |
| 6   | **`cadenceCandidates` lives in `analytics.ts`, not `recurringBills.ts`**, and is named for all cadences rather than only long ones.                                                                                                                                               | It needs `effectiveMerchant`, `median` and `spendCentsOf`; putting it in the cadence module would have made the dependency circular. `recurringBills.ts` keeps the pure arithmetic and knows nothing about analytics.                                                                                                                                                                                                                                            |
| 7   | **Cadence tolerance is ±12% of the cadence, not ±20 days.**                                                                                                                                                                                                                       | A fixed day window lets a quarterly gap pass for monthly and rejects a semi-annual bill that slipped a fortnight. The plan's "200 days must not propose" was wrong — 200 days _is_ a semi-annual bill; 240 days is the gap that belongs to no cadence, and that is what the test pins.                                                                                                                                                                           |
| 8   | **`monthlySetAsideCents` was dropped.**                                                                                                                                                                                                                                           | It is `annualCents ÷ 12`, and a detected merchant's annual figure comes from observed days rather than months — one derivation shared by every row is what keeps the column meaning the same thing throughout the table.                                                                                                                                                                                                                                         |

---

## Task 1: Save spec documentation

Create `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` with `plan.md` (this plan,
**Status: active**), `shape.md`, `standards.md` (which standards apply and the specific point
each makes here, following the exemplar at
`agent-os/specs/2026-08-12-2031-finances-insights-dashboard/standards.md`), and `references.md`
(the governing insights-dashboard spec plus the code sites named here). No `visuals/` — none
provided.

## Task 2: Schema and migration

`src/db/schema.ts` — `finance_recurring_bills`:

| Column                      | Type                           | Purpose                                                   |
| --------------------------- | ------------------------------ | --------------------------------------------------------- |
| `id`                        | uuid pk                        |                                                           |
| `user_id`                   | uuid not null → users, cascade | Every row scoped; every mutation proves it.               |
| `merchant`                  | text not null                  | Effective merchant, as `effectiveMerchant()` produces it. |
| `cadence_months`            | smallint not null              | 1, 2, 3, 6, 12. CHECK between 1 and 24.                   |
| `expected_cents`            | integer null                   | Declared amount; null means "use the median of history".  |
| `first_seen_on`             | date null                      | Anchors the next-due walk when history is thin.           |
| `notes`                     | text not null default `''`     |                                                           |
| `created_at` / `updated_at` | timestamptz                    |                                                           |

Unique index on `(user_id, merchant)` — one declaration per merchant is the whole point.

Generate the migration with `npm run db:generate`; never hand-write one (`database/migrations`).

## Task 3: Pure cadence logic — `src/lib/finances/recurringBills.ts` + `.test.ts`

New module, no db imports:

- `cadenceLabel(months)` — "Monthly", "Quarterly", "Every 6 months", "Yearly". Replaces the
  day-based local helper in `RecurringTable.tsx:8`, which currently caps at "Quarterly".
- `nextDueDate(lastChargeOn, cadenceMonths)` — calendar month arithmetic via the project's
  date helpers. **Use `asCalendarDay` / `toDateKey`, never `startOfDay`** on a date column
  (`development/dates` — the Aug 1 → Jul 31 regression).
- `annualCents(expectedCents, cadenceMonths)`. The monthly set-aside is this over twelve and
  is deliberately not a second function — see change 8.
- `spanDays(chargeDateKey, cadenceMonths)` — exact days from a charge to the day before the
  next one, which is what `allocateAcross` needs.
- `cadenceMonthsFromGapDays(days)` — the cadence a gap looks like, or null. Nearest match
  within 12%, so 200 days is a semi-annual bill that slipped and 240 days is nothing.
- `nextDueFrom(lastChargeOn, cadenceMonths, todayKey)` — walks forward, because a bill last
  charged three cycles ago is due next month, not two years overdue.

The candidate finder itself is `cadenceCandidates(rows)` in `analytics.ts` — see change 6.

Tests must fail on a plausible mistake: a Feb 29 anchor, month-end anchoring (Aug 31 + 6
months), a 240-day gap that must **not** propose, and a quarterly gap that must not pass for
monthly.

## Task 4: Wire declared bills through `src/lib/finances/analytics.ts`

Thread an optional `bills: readonly DeclaredBill[]` through, defaulting to empty so every
existing caller and test keeps working:

- `recurringMerchants(rows, bills)` — merge; a declared bill wins over a detected one and
  carries a `declared: true` flag for the ▸ marker.
- `cashFlow(rows, buckets, { levelRecurring, bills })` — the cadence map at `analytics.ts:496`
  gains declared entries, using `spanDays` rather than a detected median gap.
- `baselineSplit(rows, bucketCount, { levelRecurring, bills, buckets })` — **new behavior.**
  When levelling, a declared bill's charge is allocated across the buckets it covers instead
  of summed whole. This is what makes the tile agree with the chart.
- `oneOffSuggestions(rows, limit, bills)` — union the declared merchants into the existing
  `recurring` suppression set at `analytics.ts:1015`. This is the line that ends the
  "stuck on the list indefinitely" complaint.

Extend `analytics.test.ts` with the conservation check named in acceptance.

## Task 5: Persistence — mutations, queries, actions

- `src/lib/finances/mutations.ts` — `upsertRecurringBill(userId, input)` and
  `deleteRecurringBill(userId, merchant)`. Follow the ownership pattern `setOneOff`
  (`mutations.ts:285`) already uses: scope by `userId` in the `where`, never trust an id
  from the client.
- `src/lib/finances/dashboardQueries.ts` — `loadRecurringBills(userId)`.
- `src/app/finances/actions.ts` — `setRecurringBillAction` / `deleteRecurringBillAction`,
  thin, matching `setOneOffAction` (`actions.ts:67`).
- `mutations.integration.test.ts` — **not done until a second user has tried to read,
  change and delete the first user's bill and failed at every step** (CLAUDE.md).

## Task 6: UI

- `OneOffReview.tsx` — third disposition per row: a cadence select pre-filled from
  `cadenceCandidates`, and an **"It's a bill"** button alongside the existing exclude button
  (a button, not declare-on-change — see change 3). Keep the 16px input rule
  (`components/responsive`) and 44px tap targets.
- `RecurringTable.tsx` — declared rows with the ▸ marker, a **Set aside** column, the new
  `cadenceLabel`, an inline way to change or remove a declaration (this is the only place a
  wrong cadence gets fixed, so it cannot be write-only), and a **"Declare a bill"** control
  taking any merchant in the history — see change 2.
- `UpcomingBills.tsx` — new panel: next expected date and amount per declared bill, nearest
  first. Follows `Panel` / `PanelEmpty`.
- `InsightsView.tsx` — load bills, pass them into the four analytics calls, add the panel,
  and apply the two-state labelling on the Baseline burn tile described above.
- `src/app/finances/insights/page.tsx` — fetch bills alongside rows.

## Task 7: Classifier rule

`src/lib/finances/classify/rules.ts` — add `taylor-gas` → category `Utilities`, merchant
`"Taylor Gas"`, placed with the other utility entries (SMECO at :49, St Mary's Water at :54).
Extend `categorize.test.ts`.

## Verification

1. `npm run test:unit` — and **check for the Postgres skip warning**; the integration tests
   silently skip when the db is down, which is exactly the case that hides a dropped `userId`.
2. `npm run lint` and `npm run typecheck`.
3. Start the dev server, then `npm run smoke` — nothing above evaluates a `"use server"`
   module, so this is the only thing that proves the routes render.
4. In the running app, on real data: confirm Geico and Taylor Gas appear on the one-off
   list with a pre-filled cadence, declare them, confirm both leave the list and appear in
   the recurring and upcoming panels, then toggle "Level bills" and confirm the baseline
   tile changes value **and** changes its label.
5. Push to `origin/master` — mobile validation happens on the deployed iPhone, and work
   parked on a branch reads as a broken feature.

## Follow-ups (new work — not amendments to this frozen spec)

- **Reconciling a forecast against the charge that arrives.** The upcoming panel projects and
  nothing marks a bill paid or late. That needs a notion of a bill _instance_, which is its
  own design — and until it exists the panel's subtitle has to keep saying so.
- **Declaring a bill the register has never seen.** Every entry point here picks a merchant
  out of the imported history, so a bill whose first charge has not landed cannot be declared
  ahead of it. Reasonable today; worth revisiting alongside envelopes.
- **Sharpening the amount as history accumulates.** `expectedCents` is pinned at declaration
  time from the charge that prompted it and never moves. A premium that rises 8% a year will
  quietly under-report until someone re-declares it.
- **Envelopes** — still the next Finances spec. The set-aside column is a number to read, not
  a balance the app maintains.
