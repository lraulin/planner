# Bills whose yearly cost is known but whose dates are not

**Status: frozen / complete** (2026-08-14)
Spec folder: `agent-os/specs/2026-08-14-1104-unscheduled-bills/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`
- **Supersedes:** that spec's assumption — never written down, which is how it survived — that
  a declared bill's **cadence** and its **forecastability** are the same fact. They are not.
  Nothing else in it changes: the table, the accrual, the review-list suppression and the
  set-aside all work unchanged.

## Context

The propane bill was the case that prompted the parent spec, and it was declared semi-annual
there on a wrong premise. Taylor Gas does not bill on a schedule: they monitor the tank, refill
it at about 25%, and bill for what they delivered. The history says so plainly —

| Date       | Amount  | Gap          |
| ---------- | ------- | ------------ |
| 2024-01-23 | $150.00 | —            |
| 2024-04-01 | $379.32 | 69 days      |
| 2025-10-24 | $335.83 | **571 days** |

— which is a tank sensor and a mild winter, not a cadence with noise in it. Declaring it
"every 6 months" produced two fabricated figures: an annual cost of $671.66 (median × 2,
against $493 of actual history a year) and a forecast claiming the next delivery on
2026-10-24. That declaration has been removed.

**The correction is narrower than it first looks.** Propane is a utility bill and its _yearly_
cost is perfectly predictable — roughly $500 — even though no one can say when the truck
comes. So the parent spec was right about everything except one conflated pair: it assumed
that knowing a bill's period means knowing its dates.

Separating those two facts is a boolean. `cadence_months` keeps meaning "the period the
declared amount covers", which is what every figure on the dashboard is actually built from;
a new flag says whether the dates are predictable enough to forecast.

### What this deliberately does not do

Sorting every merchant with a few charges and real money behind it turned up three more of the
same shape — VCA Animal Hospital, LOY\*MEDSTARHEALTH, and Taylor Gas itself — against exactly
one genuinely scheduled bill (Geico, two charges 182 days apart). It is tempting to read that
as a category to detect. **It is not, and the user said so directly:** we do not get to assume
something is an ongoing bill because the same name appears twice. A vet bill is not propane;
four visits in six months is one sick pet, and annualizing that span reads $3,024 a year, which
is nonsense presented as a figure.

So nothing here infers an unscheduled bill, suggests one, or annualizes a short history into a
rate. The yearly cost is **stated by the user**, because they are the one who knows it. That is
the same principle the parent spec used for cadence, applied to the amount.

## Decisions

| Topic                            | Choice                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The new state                    | One boolean `scheduled` on `finance_recurring_bills`, default true. False means "recurs, costs this much a year, dates unknowable".                                                                                                                                                                               |
| Why not a nullable cadence       | `cadence_months = 12, expected_cents = $500, scheduled = false` already says "about $500 a year". Making the cadence nullable would have overloaded `expected_cents` to mean an annual figure in one case and a per-charge figure in the other — two meanings in one column, which is how a reader gets it wrong. |
| Forecast                         | An unscheduled bill gets **no Upcoming bills row**. There is no date to claim, and a projected date is worse than no date because it looks like knowledge.                                                                                                                                                        |
| Levelling in the cash-flow chart | An unscheduled bill's charges count as **bills rather than variable spend**, but are **not** spread across the period. Two propane deliveries in one winter each spreading over twelve months would double-count them in the chart.                                                                               |
| Levelling in the baseline        | Unchanged. `baselineSplit` accrues `annualCents × windowDays ÷ 365`, which is the user's stated yearly cost and is unaffected by how many deliveries happened to land.                                                                                                                                            |
| Detection                        | Unchanged, and deliberately untouched. `cadenceCandidates` proposes only real cadences; nothing proposes an unscheduled bill.                                                                                                                                                                                     |

## Acceptance criteria

All verified against the live database and the running app on 2026-08-14.

- [x] Taylor Gas can be declared as a utility costing a stated amount per year with no
      schedule, and shows in the recurring panel with that annual figure and its monthly
      set-aside.
- [x] It gets **no** row in Upcoming bills, while Geico still does.
- [x] Its charges count toward bills rather than variable spend in the cash-flow chart, and
      are not spread across the year — two deliveries in one winter are not double-counted.
- [x] The levelled baseline accrues its stated yearly cost regardless of how many charges
      landed in the window.
- [x] Geico's behaviour is byte-identical to before this change: same cadence, same annual
      figure, same forecast.
- [x] Nothing anywhere proposes, infers, or auto-declares an unscheduled bill.
- [x] Taylor Gas files under **Utilities** after a Reclassify. Run in the app; all three
      charges now carry `derived_category = 'Utilities'`, and the same pass folded in 3,614
      rows that had never been classified.
- [x] A swingy bill says so: SMECO shows `$188–$311` under its charge, while Comcast (2%
      spread) and MetLife Pet (0%) show a single figure. Geico's 16% stays under the band.
- [x] A second user cannot read, change or delete the first user's declarations. Still covered.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **A second axis surfaced mid-implementation: amount regularity.** Schedule and amount vary independently, and a utility is typically regular in one and wild in the other. `RecurringMerchant` gained `lowCents`/`highCents`, and the table prints the observed range under any charge whose spread exceeds the same 25% band the detector uses. | The user's observation, and the data backs it hard: SMECO runs $77.95–$311.13 across 22 charges and St Mary's Water $77.38–$184.24, while MetLife Pet is $100.24 twelve times. Printing one median for the first two states an estimate as a fact, and the annual figure built on it inherits the false confidence. |
| 2   | **Amount regularity is measured, never declared** — no column, no question, no flag.                                                                                                                                                                                                                                                             | This is the whole distinction that keeps the design small. You cannot tell "irregular schedule" from "not enough history" by looking, so `scheduled` has to be stated. Amount spread is already in the charges, so asking would be asking for something the app can see.                                            |
| 3   | **The recurring panel moved to full width.**                                                                                                                                                                                                                                                                                                     | Five columns, two of them controls, and a charge now carrying a range underneath. At half width the Set aside column — the one figure you would actually plan against — fell off the edge and needed horizontal scrolling to reach.                                                                                 |
| 4   | **Ranges print in whole dollars** (`$150–$379`, not `$150.00–$379.32`).                                                                                                                                                                                                                                                                          | A range is already an admission that the figure is soft; printing it to the cent argues with itself, and the width it cost was what pushed the set-aside column off screen.                                                                                                                                         |
| 5   | **An unscheduled bill is refused without a stated cost.**                                                                                                                                                                                                                                                                                        | It has no cadence to infer an amount from and no forecast to fall back on. A declaration with no number would contribute nothing to the baseline while still suppressing its own charges from the review list — strictly worse than not declaring it.                                                               |

---

## Task 1: Save spec documentation

This folder. Short by design — it is one boolean and the reasoning for it.

## Task 2: Schema and migration

`scheduled boolean not null default true` on `finance_recurring_bills`. Default true so every
existing declaration keeps its current behaviour without a backfill.

## Task 3: Thread it through the analytics

- `DeclaredBill` gains `scheduled: boolean`; `RecurringMerchant` gains it too so the table can
  label the row.
- `upcomingBills` skips unscheduled bills entirely.
- `cashFlow`'s span resolver returns "a bill, but no span" for them, so their charges land in
  `fixed` unlevelled rather than in `variable`.
- `recurringMerchants` and `baselineSplit` need no change — both read `annualCents`.

## Task 4: Persistence

`RecurringBillEdit` gains optional `scheduled`, following the existing write-only-what-is-
supplied rule. An unscheduled bill with no `expectedCents` is refused: a yearly cost with no
number is not a declaration, it is a wish.

## Task 5: UI

- `RecurringTable` — "No fixed schedule" in the cadence list, an editable yearly amount for
  such rows, and an "Irregular" cadence label.
- `OneOffReview` — unchanged. That list asks "this large charge, what is it?", and the answer
  "a bill costing $N a year" needs an amount field the row has no room for. The recurring
  panel is where ongoing costs get stated.

## Follow-ups (new work — not amendments to this frozen spec)

- **The range is windowed, like every other figure in the panel.** SMECO reads $188–$311 on
  a YTD window and $77.95–$311.13 over its whole history, and the yearly projection inherits
  the same windowing — $2,627.88 YTD against $2,068 all-time. That is honest for "what am I
  paying now" and misleading as "what does a year cost". Worth its own spec: the panel needs
  to say which question it is answering.
- **A bill regular in date and wild in amount is not detected at all.** All-time SMECO blows
  past `RECURRING_VARIANCE_RATIO` and lands in variable spend; only the tamer recent window
  gets it into the table. Declaring it is the workaround, and there is currently no prompt
  suggesting you should.

## Task 6: Verify, freeze, reclassify, push

Run the gates, `npm run smoke`, then in the app: declare Taylor Gas unscheduled at its real
yearly cost, confirm no forecast row and a correct set-aside, confirm Geico is untouched, and
press **Reclassify** so propane files under Utilities.
