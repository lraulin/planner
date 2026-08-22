# References for Zero-based budgeting

## Governing specs

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Superseded in one respect — **D0's rejection of tier 3** ("per-category
  discretionary envelopes encode a decision the user already makes correctly on the fly"). Nothing
  else in that spec changes.
- **Carries forward:** the two-tier model, two tables, the shared `setAsideHeld` arithmetic, the
  cadence admission test for tier 2, `status` as the whole answer to "is it budgeted", the
  matcher-uniqueness invariant across both commitment tables.
- **Why the reversal is narrow:** D0's argument is about a _category list_ — a bucket for clothes,
  a bucket for games, a bucket for books. It is a correct argument about that list and does not
  reach the model. See `plan.md` § Context and D5.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Extends.
- **Relevant decisions:** the cash position; savings excluded wholesale; the full card balance
  subtracted rather than the statement minimum; one headline rather than a per-account dashboard.
  D3's on-budget account set is the same set, made explicit as a column.

### `agent-os/specs/2026-08-18-2005-period-result/`

- **Relationship:** Extends.
- **Relevant decisions:** balances reconstructed by anchoring to today's headline and walking
  backwards (`positionAt`, `balancesAt` in `src/lib/finances/periodResult.ts`). D2's opening
  position is exactly this, evaluated at the day before the budget start month.

### `agent-os/specs/2026-08-21-1122-commitments-curation/`

- **Relationship:** Extends.
- **Relevant decisions:** a commitment carries a category that also categorises the charges it
  matches, ranked above a `rules.ts` guess and below a per-row edit. That precedence is what D6's
  auto-map reads through `effectiveCategory`.

### `agent-os/specs/2026-08-18-2058-commitments-clarity/`

- **Relationship:** Not a dependency; a standing warning. Its root cause was "the decision surface
  reports a different number than the system uses." D1's `terms[]` array and D7's insistence that
  the rollover toggle say it applies from here on are both written against that failure.

## Reference implementation — Actual Budget

`https://github.com/actualbudget/actual`, cloned locally at `../actual`. **MIT licensed**
(© James Long), so the code may be read, copied and adapted freely; the licence notice travels
with anything derived from it. We reimplement the semantics on Next.js + Postgres + Drizzle
rather than porting the code, because Actual's budget layer is a local-first reactive spreadsheet
over SQLite with CRDT sync and none of that transfers.

| Concern                                                                                    | File                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Envelope balance, carryover, To Budget** — the formulas D1 reproduces                    | `packages/loot-core/src/server/budget/envelope.ts`                                                                                                             |
| Per-category monthly activity; the on-budget filter; the batched rollup D4's query mirrors | `packages/loot-core/src/server/budget/base.ts` (`getSumAmountsByMonth`, `createCategory`)                                                                      |
| **Movement operations and their clamps** — D7                                              | `packages/loot-core/src/server/budget/actions.ts` (`coverOverspending`, `transferAvailable`, `calcBufferedAmount`, `setCategoryCarryover`, `addMovementNotes`) |
| Budget table shapes (`zero_budgets`, `zero_budget_months`)                                 | `packages/loot-core/migrations/1632571489012_remove_cache.js`                                                                                                  |
| `categories` / `category_groups`                                                           | `packages/loot-core/src/server/sql/init.sql`, `packages/loot-core/src/server/db/types/index.ts`                                                                |
| Integer-cents assertion worth copying                                                      | `packages/loot-core/src/shared/util.ts` (`safeNumber`)                                                                                                         |
| The tracking budget, for the contrast recorded in Out of scope                             | `packages/loot-core/src/server/budget/tracking.ts`                                                                                                             |
| Goal templates — the strongest follow-on                                                   | `packages/loot-core/src/server/budget/goal-template.ts`, `goal-template.pegjs`, `category-template-context.ts`                                                 |
| Budget UI, for menu vocabulary                                                             | `packages/desktop-client/src/components/budget/envelope/`                                                                                                      |
| Cell → UI naming crib                                                                      | `packages/desktop-client/src/spreadsheet/bindings.ts`                                                                                                          |

Local reference note: `docs/actual-budget/README.md` (D8).

## Similar implementations in this repo

### The accrual arithmetic this sits beside

- **Location:** `src/lib/finances/available.ts`
- **Relevance:** the closest existing analogue — pure functions over plain shapes, integer cents,
  returning a `terms[]` array so a breakdown cannot fail to sum to its headline. `buildBudget`
  follows the same shape.
- **Key patterns:** `availableToSpend`, `setAsideHeld`, `recurringSpendHeld`, `cashPosition`,
  `SPENDABLE_KINDS`.

### Commitments, end to end

- **Location:** `src/lib/finances/commitments.ts`, `commitmentRows.ts`,
  `src/lib/finances/mutations.ts`, `src/app/finances/actions.ts`,
  `src/components/finances/commitments/`
- **Relevance:** the template for a finance feature at every layer — schema doc comments, a lib
  module of pure logic, `userId`-first mutations, thin `"use server"` wrappers, a `DataGrid` view
  with a row menu and grouped headers.

### Historical balances

- **Location:** `src/lib/finances/periodResult.ts`
- **Relevance:** `positionAt` / `balancesAt` supply D2's opening figure. Do not write a second
  balance reconstruction.

### Money handling

- **Location:** `src/lib/finances/money.ts`
- **Relevance:** `parseAmountCents`, `centsToNumericString`, `numericStringToCents`, `formatUsd`,
  `sumCents`. All in-app arithmetic is integer cents; `numeric` strings only cross the DB
  boundary. New budget tables store cents directly, as the commitment tables do.

### Classification precedence

- **Location:** `src/lib/finances/analytics.ts` (`effectiveCategory`, `effectiveFlow`,
  `effectiveMerchant`), `src/lib/finances/classify/`
- **Relevance:** D6's auto-map reads `effectiveCategory` / `effectiveFlow` rather than any single
  column, so it inherits the existing override precedence instead of inventing a second one.

### Page registration and view state

- **Location:** `src/lib/navigation/pages.ts`, `src/lib/settings/finances.ts`,
  `src/components/finances/paydaySetting.ts`
- **Relevance:** where the new page and its command are declared, and the codec pattern for the
  budget start-month setting in `user_settings`.
