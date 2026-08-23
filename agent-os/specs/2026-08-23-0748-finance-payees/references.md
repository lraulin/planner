# References for Payees — one merchant identity

**Status: frozen / complete** (2026-08-23)

## Governing specs

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Prepares the replacement for **D2's `matchers text[]` storage** and
  **D3's cross-table matcher exclusivity**. The legacy behavior remains authoritative until
  the matcher-cutover delta formally supersedes it; everything else extends.
- **What carries forward:** the two-tier model (D0), propose-never-apply (D8), the
  one-page/two-section layout (D10), cadence in months.
- **What changes:** D2 argued that one column doing three jobs — display name, unique key,
  join to `finance_transactions` — was three bugs (`1PASSWORDTORONTOON` unrenameable, Taylor
  Gas needing a `rules.ts` entry to collapse two spellings, nothing able to cover two
  merchants). It split `name` from `matchers` and fixed all three. This spec finishes the
  same argument: the matcher is still a bare string that nothing owns, so it cannot be
  renamed, cannot be merged, and cannot carry a constraint. It gets a row.
- **Read for:** why the split existed at all, and the wording of the exclusivity rule at
  `src/db/schema.ts:2483`.

### `agent-os/specs/2026-08-22-2124-actual-schedules/`

- **Relationship:** Extends. This slice creates the payee id that a later delta will put in
  the payee condition; existing conditions remain merchant strings here.
- **Relevant decisions:** D1's validating parse — bad JSONB must never reach the matcher or
  the recurrence math. Widening it to the id shape is a matcher-cutover obligation, not an
  afterthought, and its `payee oneOf` widening of Actual's `payee is` stays.
- **Note:** this is the reference that _predicted_ this spec —
  `src/db/schema.ts:3024`: "The generic rule engine, payees table and auto-post service
  stay out; the condition shape is theirs so a later Rules spec can consume this data
  without a migration."

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Neither extends nor supersedes; read for pattern.
- **Key patterns:** `budget/autoMap.ts`'s `envelopeIndex` / `envelopeForRow` split is the
  shape `payees/resolve.ts` copies. `seedBudget` is the shape `seedPayees` copies —
  a pure planner with tests, invoked once behind an action, idempotent on re-run.

### `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

- **Relationship:** Extends the commitments specs; inherits this change.
- **Relevance:** `src/lib/finances/registerBillDraft.ts` (`trackAsBillDraft`,
  `trackAsBillRefusal`, `claimedMatchersOf`) is the application-level exclusivity check that
  the matcher-cutover delta will replace with payee claims. Its refusal _message_ is still
  wanted; only the mechanism that detects the conflict changes.

## Actual Budget (`../actual`, MIT © James Long)

| Concern                                                                | File                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Payee create / lookup, case-insensitive exact name                     | `packages/loot-core/src/server/accounts/payees.ts:3-16`                            |
| `payees`, `payee_rules`, `payee_mapping` tables                        | `packages/loot-core/migrations/1550601598648_payees.sql`                           |
| **Merge, and the mapping indirection we deliberately drop (D3)**       | `packages/loot-core/src/server/db/index.ts:566-654`                                |
| Why the indirection exists — undo replays backwards                    | `packages/loot-core/src/server/rules/rule-utils.ts:112-160`                        |
| Payee name normalization on import: trim, then title-case              | `packages/loot-core/src/server/accounts/sync.ts:416-483`                           |
| `resolvePayee` / `createNewPayees` — payees written only if referenced | `packages/loot-core/src/server/accounts/sync.ts:395-414, 574-585`                  |
| Payees management UI                                                   | `packages/desktop-client/src/components/payees/`                                   |
| **For the Rules spec that follows, not this one**                      | `packages/loot-core/src/server/rules/`, `server/transactions/transaction-rules.ts` |

`docs/actual-budget/README.md` maps each concern to its file and is the entry point. At this
spec's freeze it now distinguishes the shipped payee catalog from the unported matcher/rules
cutover.

## In-repo implementations studied

### The classification pipeline

- **`src/lib/finances/classify/merchant.ts`** — `normalizeMerchant`. Stays, unchanged: it is
  the alias key generator. Its header states the deliberate split this spec relies on —
  mechanical string surgery here, facts about the world in `rules.ts`. Processor prefixes at
  lines 43-52 are what make D4's counterparty case narrow.
- **`src/lib/finances/classify/rules.ts`** — 66 rules, 48 with a `merchant:`. The seed source
  for payee names (D5). `matchRule` is sync, global, takes no `userId`, and is called from
  render paths — which is why identity has to become a column before it can become data.
- **`src/lib/finances/classify/categorize.ts`** — the per-row tier order: commitment >
  description rule > bank label, with `financeTransactions.category` above all of them by
  being a different column. The precedence model the Rules spec will extend.
- **`src/lib/finances/classify/reclassify.ts`** — `planReclassify` / `changedRows`. The
  whole-history idempotent pass. **`reclassify.ts:131-134` is D4's precedent**: a PayPal
  resolution's counterparty already gets its own `categorize()` call and is merged
  field-by-field.

### The write path

- **`src/lib/finances/mutations.ts:310`** — `reclassifyTransactions`. Writes exactly
  `derived_category`, `derived_flow`, `transfer_group_id`; `payee_id` becomes the fourth.
  The doc comment at :306 explaining what is _not_ in the update statement is load-bearing
  and must stay true.
- **`src/lib/finances/mutations.ts:505`** — `reclassifyIfCategoriesMoved`. The precedent for
  "an edit triggers a whole-history pass that writes nothing when nothing moved"; an alias
  edit uses the same mechanism.
- **`src/lib/finances/import.ts`** — inserts or skips, never updates. Why the raw
  `description` is durable, and why we need no `imported_payee` column.

### The read path inventoried for the matcher-cutover delta

`effectiveMerchant()` at **`src/lib/finances/analytics.ts:128`**, and its callers:
`insightsFilter.ts`, `sankeyFlow.ts`, `dashboardQueries.ts`, `commitments.ts`,
`schedules/match.ts`, `schedules/queries.ts`, `schedules/discover.ts`,
`registerBillDraft.ts`, `classify/categorize.ts`, `agent/financeTools.ts`,
`agent/tools.ts`, `components/finances/financeColumns.tsx`,
`components/finances/insights/TransactionAudit.tsx`.

### UI patterns to copy

- **`src/components/finances/schedules/SchedulesView.tsx`** + `scheduleColumns.tsx` +
  `ScheduleDrawer.tsx` — the closest analogue: a finance catalog page built as a column
  array over the shared `DataGrid` with a drawer for full-record editing. `page.tsx` there
  (31 lines) is the server-component shape to copy.
- **`src/components/finances/budget/MoveMoneyDialog.tsx`** — a `ModalShell` confirmation
  that names exactly what will move; the model for the merge dialog.
- **`src/lib/navigation/pages.ts:233`** — the `finances` page registry, ordered by how often
  a page is opened rather than when it was built.
- **`scripts/smoke.mjs:42`** — routes are discovered from the filesystem, so `/finances/payees`
  is covered the day it lands.
