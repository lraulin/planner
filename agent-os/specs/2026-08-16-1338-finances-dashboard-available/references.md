# References for Finances Dashboard — available to spend

**Status: frozen / complete** (2026-08-16)

## Governing specs

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends. **Supersedes** its out-of-scope line reserving available-to-spend
  for "the next Finances spec" — that is this one. Nothing else in it changes.
- **Carries forward:**
  - D7 — the synced balance leads for linked accounts; `FinanceAccountRow.balanceCents` is
    already synced > statement-anchored > ledger.
  - D7a — SimpleFIN's balance is in module sign, so a credit card comes back negative with no
    branch. The whole of D2's arithmetic depends on this.
  - D7b — `balanceAsOf` is the provider's `balance-date`, not the read time. The freshness the
    page reports is real.
  - D8a — `available-balance` is all zeros and unusable; the available figure must be derived
    from the balance and pending rows. This is the origin of D2a.
  - D4 — `pending` is a real boolean, and Chase supplies pending rows while Capital One does
    not.
  - D5c — there is no forced refresh, which is why the page reports staleness instead of
    offering a button that implies otherwise.

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. The founding finance spec.
- **Carries forward:** positive is money into the account, uniformly across kinds — the reason
  the available-to-spend arithmetic is all additions and never branches on kind. Integer cents
  everywhere in application code. Account identity as `(userId, externalSource, externalKey)`.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends. Not superseded in any respect.
- **Carries forward:** paycheck detection by **cadence, not merchant name**, which is what makes
  the next-payday projection survive an employer change; pay periods; `effectiveMerchant()` as
  the merchant identity a declared bill is keyed on.

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Extends. `finance_recurring_bills` is the table gaining two columns.
- **Carries forward:** cadence in **months, not days**; one declaration per merchant; detection
  proposes and never applies; the existing declaration UI is where the set-aside control belongs.

### `agent-os/specs/2026-08-14-1104-unscheduled-bills/`

- **Relationship:** Extends. `scheduled` and the new `set_aside` are orthogonal — one says
  whether the date is knowable, the other whether the cost accrues.
- **Carries forward:** "a projected date reads as knowledge however it is captioned" — the rule
  that makes the payday panel name its own source.

### `agent-os/specs/2026-08-14-1524-statement-reconcile/`

- **Relationship:** Background. Defines the statement-anchored tier of the headline balance that
  D2a has to distinguish from a synced one.

## Similar implementations

### Insights page — the shape to copy

- **Location:** `src/app/finances/insights/page.tsx`, `src/components/finances/insights/`
- **Relevance:** the exact page skeleton — server component, `force-dynamic`,
  `getCurrentUserId()` → `Promise.all([...])` → `<AppShell active="finances">` → one client view
  that does a single `useMemo` over a pure analysis module.
- **Key patterns:** all computation lives in `src/lib/finances/insightsAnalysis.ts` and is shared
  with the agent tools so page and agent cannot disagree; `useToday()` supplies the local day.

### Panel primitives

- **Location:** `src/components/finances/insights/Panel.tsx`
- **Relevance:** `Panel`, `PanelEmpty`, `StatRow`, `StatTile` — reused as-is. Nothing about them
  is finance-specific except the `income` / `spend` tone names.

### Account balances strip

- **Location:** `src/components/finances/AccountBalances.tsx`, fed by
  `listAccounts(userId)` in `src/lib/finances/queries.ts`
- **Relevance:** already renders headline balance with the ledger mismatch. `listAccounts` is the
  read the dashboard reuses rather than reimplementing — it computes the three-tier headline and
  `syncedBalanceAsOf` that D2a turns on.

### Payday detection and pay periods

- **Location:** `src/lib/finances/classify/income.ts` (`detectIncome`, `Payday`, `BIWEEKLY_DAYS`),
  `src/lib/finances/classify/payPeriods.ts` (`buildPayPeriods`, `NEXT_PAYCHECK_SLACK_DAYS`)
- **Relevance:** the source of the payday series. `payPeriods.ts` also demonstrates the
  gap-tolerance reasoning the next-payday walk needs.

### Declared-bill arithmetic

- **Location:** `src/lib/finances/recurringBills.ts` (`DeclaredBill`, `CADENCE_CHOICES`,
  `nextDueDate`, `shiftDateKeyMonths`, `annualCents`)
- **Relevance:** the month-arithmetic conventions the set-aside accrual follows — `YYYY-MM-DD`
  keys, months not days, no `Date` round-trip. Its header already names the monthly set-aside as
  a derived figure.

### Bank sync reads

- **Location:** `src/lib/banksync/queries.ts` (`listConnections`)
- **Relevance:** connection freshness for the "what this cannot see" panel. The module's hard
  rule is that no access URL escapes it.

### Settings scopes

- **Location:** `src/lib/settings/finances.ts`, `src/lib/settings/scopes.ts`,
  `src/lib/settings/parse.ts`
- **Relevance:** where the payday override lives, and the parse helpers it uses.

### Navigation registry

- **Location:** `src/lib/navigation/pages.ts` (+ `pages.test.ts`),
  `src/components/shell/moduleEntry.ts`
- **Relevance:** the finances page array and its ordering; `moduleEntryRedirect`'s preference for
  the remembered page over the default.
