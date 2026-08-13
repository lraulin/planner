# Finances insights dashboard

**Status: active**  
Spec folder: `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — same two
  tables, the one sign rule (positive = money into the account), `numeric(14,2)` with sums
  in SQL, insert-or-skip import, the bank-owned/user-owned column split, and the shared
  `DataGrid` register.
- **Extends:** `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` and
  `agent-os/specs/2026-08-12-1540-chase-statement-import/` — the `finance_statements` /
  `finance_statement_rates` snapshot store this spec finally reads.
- **Supersedes:** the founding spec's "reporting and charts" **out-of-scope** line, and its
  "no taxonomy, no rules" decision for `category`. It does **not** supersede the sign rule,
  the fingerprint/dedup design, insert-or-skip, or account identity.

## Context

The module has 2,845 transactions across 5 accounts spanning **2023-07-24 → 2026-08-10**
and nothing that reads them back as insight. This spec turns that history into decision
support: what life actually costs, how much is needed, where spending could be cut.

Two distortions drive every design choice, both raised by the user:

- **Biweekly pay makes calendar months lie.** 26 paychecks over 12 months means some months
  hold three and look wildly positive while the next looks negative. That is a bucketing
  artifact, not a signal.
- **Averaging lies in the other direction.** A ~$20k wedding and a house move are real but
  non-repeating; folding them into an average says nothing about ongoing monthly need.

Both reduce to one problem: **separating baseline from lumpy.** Making that separation
visible and durable is the point of the feature.

Roadmap § Financial planning — not a new item; envelopes remain outstanding and are still
deferred. **Achieve had no finance module**, so nothing in `docs/achieve-planner/` governs
this and there is no fidelity obligation.

## The blocking finding: the numbers are not yet honest

Measured against the live database before planning. Charts built on today's data would be
confidently wrong, so Layers 1–2 below exist to fix that first.

| Problem                             | Evidence                                                                                                                                                                                                                                                    | Consequence if ignored                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Transfers/payments unflagged**    | Total outflow **−$493,642**; a description regex removes **$81k** and still misses `Withdrawal from CAPITAL ONE MOBILE PMT` — **115 rows, avg −$1,292**. Card purchases are already negative on the card; the payment from checking is a _second_ negative. | Spending inflated by six figures.         |
| **Spending uncategorized**          | **2,844 of 2,845** rows have no user `category`. Bank `sourceCategory` has 23 values with per-bank vocabularies (Chase "Shopping" vs Capital One "Merchandise") and is **blank on 875 rows** — the 360 bank feed has no category column.                    | "Where can I cut back" is unanswerable.   |
| **Two-year itemization blind spot** | The Capital One card itemizes only from **2025-08-10**; payments to it run from **2023-08-04**. **$109,248** of pre-2025-08 spending exists solely as lump payments.                                                                                        | An "all time" category chart omits $109k. |

Favourable signals found in the same data and relied on below:

- Capital One descriptions embed the **counterparty account's last four**
  (`XXXXXXX2603`, `XXXXXXX2322`), matching `finance_accounts.external_key` directly.
- Subscriptions are detectable by **variance alone, without categories**: `METLIFE PET`
  (−$100.24, σ=0.00, 12×), `COMCAST / XFINITY` (−$100.07, σ=0.99, 12×), `SIMPLISAFE`
  (−$34.71, σ=0.88, 12×), `ST MARYS COUNTY METROPOLI` (−$88.55, σ=2.76, 12×).
- Merchant strings need normalizing: `WM SUPERCENTER #1981` and `WAL-MART #1981` are one
  store; rent is `TURBOTENANT.COM RENT:RAULI`, `TurboTenant RENT:RAULI` and
  `RENT:RAULIN RENT:RAULI`, all $2,100.00.
- **The employer changed three times** — PenFed (2023-07→2023-12), `ENDAVA INC DIRECT DEP`
  (2023-08→2024-03), `GA8248 TRUSTEDQA DIRDEP` (2024-07→2026-03), then the same employer as
  `…TRUSTEDQA PAYROLL` (2026-03→2026-08). Paycheck detection must be cadence-based, not a
  merchant constant.
- **118 statements** with interest, fees, credit limits and APRs are loaded and read by
  nothing.

## Decisions

| Topic              | Choice                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Time axis          | Calendar months by default with a **trailing-12-month rolling average** overlay, plus a **pay-period toggle** (one paycheck/bucket). |
| Normalized income  | `median(paycheck) × 26 ÷ 12`, shown as a stable monthly figure rather than a jagged one.                                             |
| One-offs           | Per-transaction `exclude_from_baseline` flag **and** an optional `event_label`; candidates auto-suggested, never auto-applied.       |
| Baseline reporting | Baseline burn and one-off spend are always **two numbers**, never one blended average.                                               |
| Categories         | A taxonomy with a description-pattern **rules engine**; bank-vocabulary mapping is the fallback tier. Backfilled across history.     |
| Derived vs user    | Every classified value has a recomputable `derived_*` column and a user override that wins. Re-running rules never destroys an edit. |
| Transfers          | Real pairing via `transfer_group_id`, not a description regex. Unpaired legs still classify.                                         |
| Charts             | Hand-rolled SVG following `MetricChart.tsx`, reusing `src/lib/metrics/derive.ts`. **No new dependency.**                             |
| Coverage           | The pre-2025-08 blind spot is stated **in the UI**, not just in this spec.                                                           |

### Why derived + override rather than one column

The module already separates bank-owned `sourceCategory` from user-owned `category`
(founding spec). Classification adds a third kind of value — _computed, and safe to throw
away_. Keeping it in its own `derived_*` column is what lets "Reclassify" be a button
someone can press twice without losing a single manual correction. Effective values resolve
as `coalesce(flow_override, derived_flow)` and
`coalesce(category, derived_category, mappedSourceCategory, 'Uncategorized')`.

### Why classification must never change a balance

An account's balance is `sum(amount)` (founding spec — there is no `balance` column). None
of the new columns touch `amount`, so a reclassify that alters any account balance is a bug
by construction. That makes it the single sharpest test available for this work and it is
called out in acceptance below.

## Schema additions

All on `finance_transactions`. New enum `finance_flow_kind` seeded complete on creation —
`ALTER TYPE … ADD VALUE` fails on Neon's pooler (`src/db/schema.ts:1923`).

| Column                  | Type                             | Purpose                                      |
| ----------------------- | -------------------------------- | -------------------------------------------- |
| `derived_category`      | `text null`                      | Rules output. Recomputable; safe to wipe.    |
| `derived_flow`          | `finance_flow_kind null`         | Recomputable flow classification.            |
| `flow_override`         | `finance_flow_kind null`         | User's correction; wins over `derived_flow`. |
| `transfer_group_id`     | `uuid null`                      | Shared by both legs of a matched transfer.   |
| `exclude_from_baseline` | `boolean not null default false` | The one-off flag.                            |
| `event_label`           | `text not null default ''`       | "Wedding", "House move".                     |

`finance_flow_kind` = `spend | income | internal_transfer | external_transfer | refund | interest_fee`.

Indexes: `(user_id, transfer_group_id)` and `(user_id, derived_flow, transaction_date)`.
One-off _suggestions_ are computed on read — no column.

## Acceptance criteria

- [ ] Every account's `sum(amount)` is **byte-identical before and after** `reclassify`.
- [ ] `Withdrawal from CAPITAL ONE MOBILE PMT` (115 rows) and
      `Withdrawal from CHASE CREDIT CRD EPAY` (51 rows) classify as `internal_transfer`,
      including the pre-2025-08 rows whose opposite leg does not exist.
- [ ] Reported spend excludes both legs of every `internal_transfer`.
- [ ] `reclassify` is idempotent, and a second run preserves `category`, `flow_override`,
      `exclude_from_baseline` and `event_label`.
- [ ] `normalizeMerchant` collapses the Walmart pair, the three TurboTenant spellings, and
      `TRUSTEDQA DIRDEP`/`TRUSTEDQA PAYROLL`.
- [ ] Paycheck detection yields one continuous income history across all three employers.
- [ ] The pay-period toggle visibly flattens the three-paycheck artifact.
- [ ] Baseline burn and one-off spend appear as separate figures, with named events broken
      out.
- [ ] The recurring/subscriptions panel lists the four known subscriptions with annualized
      cost.
- [ ] The dashboard states the pre-2025-08 coverage gap where a user reading a category
      chart will see it.
- [ ] A second user cannot read, change or delete the first user's rows through any new
      query or mutation.
- [ ] `npm run smoke` passes with the dev server running.

## Changes from original plan

| #   | Change                                                                                                                                                   | Why                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PenFed deposits are not treated as paychecks. The three-employer income succession is Endava → TrustedQA (`DIR DEP` / `DIRDEP`) → TrustedQA (`PAYROLL`). | Live amounts and gaps show PenFed as irregular sweeps from an unimported bank, not a 14-day series. Cadence detection plus the existing transfer classifier keep them as `external_transfer`; calling them income would invent earnings the imported accounts cannot see. |

## Tasks

1. **Save spec documentation** — this folder.
2. **Schema + migration** — six columns, the enum, two indexes; generated migration; cross-user integration test.
3. **Merchant normalization + rules engine** — `classify/merchant.ts`, `classify/rules.ts` + unit tests.
4. **Transfer pairing** — `classify/transfers.ts`, three signals + tests including the unpaired leg.
5. **Income detection + pay-period calendar** — `classify/income.ts`, `payPeriods.ts` + tests across the three employers.
6. **`reclassify` mutation + backfill** — idempotence and override-survival integration tests. **Checkpoint: reconcile totals against the register.**
7. **Analytics lib** — `analytics.ts` + unit tests per function.
8. **Dashboard queries** — `dashboardQueries.ts` + cross-user integration tests.
9. **Chart primitives** — bars and stacked area in `derive.ts` + math tests.
10. **Dashboard page + panels** — route, nav registration, nine panels.
11. **Register integration** — flow filter, one-off flag, event label, bulk one-off review.
12. **Verify, freeze spec, update roadmap.**

Tasks 2–6 are the "make the numbers honest" phase and form a natural shipping checkpoint
before any chart exists.

> **While this spec is active:** record material changes to requirements, design or scope —
> including feedback on what was built — in the sections above and append a row to **Changes
> from original plan**. Skip pure implementation detail. Freeze when verified.
