# References for the Supplies worksheet

## Governing specs

### `agent-os/specs/2026-08-14-1439-amazon-order-ingest/`

- **Relationship:** Extends. Frozen 2026-08-14.
- **Relevant decisions:** The precedent for a standalone finance surface that owns its own
  tables and deliberately does not touch the ledger — "do not write into
  `finance_transactions`, do not change `amount`, do not invent spend". Supplies takes the
  same boundary. It also established the Orders page at `/finances/orders` as a new built
  page on the module page bar, which is the pattern Task 8 repeats.
- **What Supplies changes about it:** one added index,
  `amazon_order_items_user_asin_idx` on `(user_id, asin)`. Nothing else.
- Note its explicit exclusion, still in force: matching orders to transactions by
  date + last-4 + amount is future work, "its own spec".

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. The founding Finances spec, frozen 2026-08-12.
- **Relevant decisions:** Own tables with their own `userId`; money as `numeric(14,2)` for
  bank-sourced amounts; the shared `DataGrid` register pattern; Finance stays a separate
  module that links into nodes rather than forking a second hierarchy — so a supply item is
  its own row, never a `node_type`. Also: "Achieve had no finance module, so there is no
  fidelity obligation here."

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends, read-only. **Status: active** (reopened 2026-08-24).
- **Relevant decisions:** An envelope is a row on `finance_budget_categories` behind a
  `kind` discriminator (`income` / `spending` / `bill` / `savings`); a bill is an envelope,
  not a parallel table. This is also the spec that articulates "two workarounds for one
  missing concept is the signal to collapse rather than add a parallel system" — worth
  re-reading before anyone proposes that the Supplies worksheet should become part of the
  budget tables. It should not: it stores an _estimate of consumption_, which no envelope
  row models.
- **What Supplies does with it:** reads `name` and the current month's budgeted amount for
  a linked envelope. Never writes.

### `agent-os/specs/2026-08-13-0747-module-pages/` and `2026-08-13-0845-module-consolidation/`

- **Relationship:** Extends.
- **Relevant decisions:** One registry for module pages, a shell-owned page bar, exactly one
  `isDefault` per module, `lastPage` stickiness on the bare module path.

### Read for shape, not binding

- `agent-os/specs/2026-08-22-1948-zero-based-budget/` — the model for heavily unit-tested
  pure calculation logic in `src/lib` with integer-cent invariants. Its _formulas_ do not
  apply here (see `standards.md`, "Deliberately not applied"); its _testing posture_ does.
- `agent-os/specs/2026-08-25-1633-budget-inspector/` — the current right-pane detail pattern
  for a finance grid, if a supply-item detail surface is wanted later.
- `agent-os/specs/2026-08-25-2144-payee-evidence-and-merge/` — names "Amazon order-data
  categorisation" (2,328 rows, 42% of the categorisation backlog) as the largest remaining
  slice and defers it to its own spec. Closest existing neighbour to this work; Supplies
  does **not** claim that slice.

## Similar implementations to borrow from

### Smallest complete finance feature — copy its shape end to end

- **Location:** `src/lib/finances/tags/{mutations,queries}.ts`,
  `src/lib/finances/tags/mutations.integration.test.ts`,
  `src/components/finances/tags/TagsView.tsx`, `src/app/finances/tags/page.tsx`
- **Relevance:** the minimum viable slice of every layer this spec needs.
- **Key patterns:** `userId` as the first parameter of every exported function; a
  `requireTag`-style ownership probe that throws a human sentence _before_ the write; the
  `where` on the update repeating `eq(table.userId, userId)`; partial `…Edit` types applied
  with spread guards and `updatedAt: new Date()`; hand validation and thrown sentences —
  **no zod in the finances feature** (zod exists in the repo but only `src/lib/agent/`
  imports it).

### Editable money cell

- **Location:** `src/components/finances/budget/budgetColumns.tsx:50-80` (`assignedCell`),
  with `moneyColumns()` immediately below it.
- **Relevance:** the exact interaction the worksheet's Cost/Order field needs.
- **Key patterns:** uncontrolled `<input type="text" inputMode="decimal">`,
  `key={row.node.assignedCents}` to re-seed after a server round-trip, select-all on focus,
  Enter blurs and Escape reverts, parse-and-commit on blur with a revert when the parse
  fails. `moneyColumns()` builds its related columns together "so the totals cannot drift" —
  the same reason the period columns here should be built as one unit.

### Money conventions

- **Location:** `src/lib/finances/money.ts` (+ `money.test.ts`)
- **Relevance:** the rule that decides D4.
- **Key patterns:** integer cents everywhere; parse at the edge, compare and total in cents,
  format only for display. `formatUsd(cents)` renders the sign outside the symbol
  (`-$10.59`); it is deliberately **not** `formatMoney` from `src/lib/tree/format.ts`, which
  renders `$-10.59`. There is no `formatCurrency`. Also available: `parseAmountCents`
  (handles `$`, commas, and `(1.23)` accounting negatives), `sumCents`, `formatUsdCompact`.

### Cross-user isolation test

- **Location:** `src/lib/finances/mutations.integration.test.ts:206-260`
  (`describeDb("finance user isolation")`)
- **Relevance:** the block Task 9 copies.
- **Key patterns:** `databaseReachable()` / `warnDatabaseSkipped()` gating from
  `src/lib/testing/database.ts`; a `makeUser()` helper per test pushing into
  `createdUserIds` and cleaned up in `afterAll` (the cascade wipes everything); separate
  tests for read, change and delete, each asserting the owner's row is _still intact_
  afterwards rather than only that the intruder's call threw.

### Partial unique index precedent

- **Location:** `src/db/schema.ts:459` — ``.where(sql`${table.isInbox}`)`` on a
  `uniqueIndex`, and further examples at lines 468, 979, 1136, 1139.
- **Relevance:** proves the "at most one `in_use` option per item" constraint is expressible
  in this schema's own idiom rather than needing an application rule.

### Text-plus-check instead of `pgEnum`

- **Location:** `src/db/schema.ts` — `ENVELOPE_KINDS` and the
  `finance_budget_categories_kind` check on `financeBudgetCategories` (~line 2574).
- **Relevance:** the pattern `rate_basis` must follow.
- **Key patterns:** a `const` tuple + derived type + `text().$type<X>()` + a `check()`
  restating the values. New enum-ish columns are never `pgEnum`, because
  `ALTER TYPE … ADD VALUE` fails on Neon's transaction-mode pooler.

### Sparse storage doctrine

- **Location:** the comment above `financeBudgetAllocations` (`src/db/schema.ts:2795`).
- **Relevance:** "Storage is sparse and a missing row means zero, never null." An item with
  no options is a real state (you named the thing before pricing it) and should render as a
  row with blank totals, not as an error.

## Findings about the Amazon data, measured during shaping

These decided Task 4 and Task 5 and are worth keeping — re-deriving them costs a session.

### The data is fully item-level

`amazon_order_items` (`src/db/schema.ts:3149-3317`, migration
`drizzle/0039_third_northstar.sql`) stores one row per line item with `asin`,
`product_name`, `quantity`, `unit_price numeric(14,2)`, `item_paid`, `discounts`,
`subscribe_and_save`, `ship_date`; `order_date` and `order_status` live on the parent
`amazon_orders`. Volume: **3,393 retail items / 2,605 orders, 2000-09-11 → 2026-08-13.**

`unit_price` is the price of **one purchased package**, and `quantity` is how many packages
were ordered — so `cost_per_order_cents` maps from `unit_price`, not from `item_paid`.
Digital items have `unit_price` NULL and only `item_paid`, which is one reason the
suggestion query filters to `channel = 'retail'`.

### There is no product-level aggregation anywhere yet

`src/lib/amazon/queries.ts#listAmazonItems` returns **every** line item flat and
unpaginated; `src/lib/amazon/grouping.ts` groups client-side and only by
`["year", "month", "order", "channel"]`. There is no product dimension. The suggestion
query is net-new and must be a real SQL `group by`, not a filter over `listAmazonItems`.

There is also **no index on `asin` or `product_name`**, which is why Task 2 adds one — a
per-user `group by asin` would otherwise be a full scan of the user's items.

### Traps for the suggestion query

- **Cancelled and refunded items are kept.** `persistSlim` upserts a full snapshot, so any
  frequency count must filter on `order_status` / `shipment_status` or it will treat
  cancellations as purchases.
- **`subscribe_and_save` is derived**, from `Shipping Option === "std-sns-us"`, and is a
  ready-made "this recurs" signal — better than a purchase count for items bought on a
  subscription.
- **`product_name` is Amazon's raw long title**, unnormalised, with no brand or category
  split. The same physical product changes title over the years; `asin` is the stabler key,
  though a product can change ASIN across variants. Titles are where pack size lives
  (`42 Count`, `Pack of 12`), which is what `packSize.ts` exists to read.
- **`shipping_charge` is shipment-level, not item-level** ("as Amazon printed it", per the
  comment in `src/lib/amazon/types.ts`). Do not add it into a per-unit cost.

### No linkage between Amazon rows and the ledger exists

Confirmed absent, and deliberately so. The only Amazon-aware code on the finances side is
string heuristics over bank descriptors — `src/lib/finances/payees/canonicalNames.ts:59`,
`matchExisting.ts:36`, `classify/merchant.ts:82`, `chaseStatement.ts:18` — none of which is
row linkage. `amazon_orders.payment_last4` + `order_date` + `item_paid` are present and
populated for whenever that spec happens; it is not this one.

## Code map for the implementation

New:

```
src/lib/finances/supplies/cost.ts               + cost.test.ts
src/lib/finances/supplies/packSize.ts           + packSize.test.ts
src/lib/finances/supplies/suggestions.ts        + suggestions.test.ts
src/lib/finances/supplies/queries.ts            + queries.integration.test.ts
src/lib/finances/supplies/mutations.ts          + mutations.integration.test.ts
src/app/finances/supplies/page.tsx
src/components/finances/supplies/SuppliesView.tsx
src/components/finances/supplies/suppliesColumns.tsx
src/components/finances/supplies/SuggestFromAmazonDialog.tsx
```

Touched:

```
src/db/schema.ts                       two tables + one index on amazon_order_items
drizzle/00NN_*.sql, meta/              generated, committed together
src/app/finances/actions.ts            appended actions
src/lib/navigation/pages.ts:233        one PageEntry after `budget`
src/lib/navigation/pages.test.ts:61    ordered-id assertion
src/components/shell/globalCommands.ts GO_KEYWORDS.finances
src/components/amazon/amazonColumns.tsx  "Add to Supplies" row action
```

Not touched, on purpose: `src/components/shell/modules.ts` (it exposes pages rather than
listing them) and `scripts/smoke.mjs` (it discovers routes from the filesystem, so the new
page is covered the day it is added).
