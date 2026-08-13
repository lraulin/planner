# References — Finances insights dashboard

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. Supersedes its "reporting and charts" out-of-scope line and its
  "no taxonomy, no rules" decision for `category`.
- **Carries forward:** the sign rule (positive = money into the account), `numeric(14,2)`
  with sums in SQL, the fingerprint + occurrence ordinal, insert-or-skip import, account
  identity via `(externalSource, externalKey)`, and the bank-owned vs user-owned column
  split that this spec extends into derived vs override.
- **Still deferred by it and by this spec:** envelopes.

### `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` and `agent-os/specs/2026-08-12-1540-chase-statement-import/`

- **Relationship:** Extends.
- **Relevance:** they populated `finance_statements` (118 rows) and
  `finance_statement_rates` (95 rows) and both explicitly built **no UI**. This spec is the
  first consumer, for the interest-and-fees panel.

## Code to reuse

### Chart math and the charting precedent

- **`src/lib/metrics/derive.ts`** — `niceTicks` (:475), `niceTimeTicks` (:297),
  `seriesPolyline` (:421), `yDomain` (:450), `plotPoint` (:508), `dateXFraction`,
  `dateKeyOrdinal`, `chartPoints`. Scales and ticks come free; **bar and stacked-area
  primitives are the only new math.**
- **`src/components/metrics/MetricChart.tsx`** — the house charting pattern: 640×240
  viewBox, `pad {left:44,right:16,top:20,bottom:28}`, theme tokens, and hover _and_ tap
  tooltips. Copy the structure, not the hard-coded `#3b5bdb` / `#6aab6a`.

### Finance module

- **`src/lib/finances/queries.ts`** — `scopeConditions` (:31) is the `userId` + account +
  date-window predicate builder every new rollup should reuse, and the reason a filter
  cannot be added to a list without also reaching its total. `transactionTotalCents` (:138)
  is the only existing aggregation.
- **`src/lib/finances/mutations.ts`** — `requireTransaction` (:23) / `requireAccount` (:40)
  are the ownership-proof pattern the new mutations follow.
- **`src/lib/finances/money.ts`** — `numericStringToCents`, `centsToNumericString`,
  `formatUsd` (sign outside the symbol), `sumCents`. Money stays integer cents in JS;
  totals over many rows are computed in SQL.
- **`src/lib/finances/grouping.ts`** — `transactionDatePart` parses `YYYY-MM-DD` with a
  regex and never constructs a `Date`. The bucketing functions must follow it.
- **`src/lib/finances/fingerprint.ts`** — `identityOf` and the occurrence-ordinal logic
  (:64-75). Not modified here, but the transfer matcher solves a structurally similar
  problem (pairing near-identical rows) and should not reinvent its counting approach.
- **`src/lib/finances/import.ts`** — `importFinanceCsvFiles` (:279) shows the chunked
  `db.transaction` write pattern that `reclassify` should mirror for its bulk update.

### UI surfaces to extend

- **`src/components/finances/FinancesView.tsx`** — the register; `AccountBalances` (:48) is
  the balance strip the reconciliation check compares against.
- **`src/components/finances/financeColumns.tsx`** — where the new flow / one-off / event
  columns get their `filterKind` and `sortValue`.
- **`src/components/finances/TransactionDrawer.tsx`** — bank half read-only; the new
  user-owned fields go beside `category` and `notes`.
- **`src/components/shell/modules.ts:205`** — the finances nav entry to sit beside.

## Data ground truth

Recorded so a later reader can tell whether the classifier still works. All from the live
database on 2026-08-12.

| Fact                                       | Value                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Transactions / accounts / span             | 2,845 · 5 · 2023-07-24 → 2026-08-10                                                        |
| Rows with a user category                  | 1                                                                                          |
| Rows with blank `sourceCategory`           | 875 (the 360 bank feed has no category column)                                             |
| Total outflow, all accounts                | −$493,642                                                                                  |
| `Withdrawal from CAPITAL ONE MOBILE PMT`   | 115 rows, avg −$1,292                                                                      |
| `Withdrawal from CHASE CREDIT CRD EPAY`    | 51 rows, −$30,360 total                                                                    |
| `Paycheck Percentage Transfer` (both legs) | 61 checking / 60 savings, ≈ ∓$31k                                                          |
| Capital One card itemization starts        | 2025-08-10 (payments to it start 2023-08-04)                                               |
| Pre-itemization Capital One payments       | $109,248                                                                                   |
| Known subscriptions (σ over 12 charges)    | METLIFE PET 0.00 · COMCAST/XFINITY 0.99 · SIMPLISAFE 0.88 · ST MARYS COUNTY METROPOLI 2.76 |
| Rent                                       | $2,100.00, three description spellings                                                     |
| Employer succession                        | PenFed → ENDAVA INC → GA8248 TRUSTEDQA (DIRDEP → PAYROLL)                                  |
| Statements / rate rows                     | 118 · 95, read by nothing before this spec                                                 |
