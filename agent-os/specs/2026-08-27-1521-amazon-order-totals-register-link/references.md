# References for Amazon order totals and register linking

## Governing specs

### `agent-os/specs/2026-08-27-1202-amazon-subscribe-and-save/`

- **Relationship:** Extends; supersedes two decisions (order money is the item-line sum; orders
  are reached only through a payments-history walk).
- **Relevant decisions:** subscription/charge/charge-order/match/allocation tables; Bill per
  subscription id; strict automatic match thresholds; capture modal and review drawer; the
  userscript is a thin extractor and `snapshot.ts` is the authoritative parser.

### `agent-os/specs/2026-08-14-1439-amazon-order-ingest/`

- **Relationship:** Extends.
- **Relevant decisions:** retail line identity `orderId:ASIN:ordinal`; Amazon rows are receipts,
  not bank rows; Amazon-owned upserts never erase user-owned fields.

### `agent-os/specs/2026-08-26-2022-split-transactions/`

- **Relationship:** Extends.
- **Relevant decisions:** parent keeps bank amount and no category; children sum exactly;
  proportional remainder is the tax/fee allocator; nested splits are forbidden.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** a Bill is `finance_budget_categories.kind = 'bill'`; its envelope is
  the transaction category.

## Code the work touches

### Amazon receipt pipeline

- **Location:** `src/lib/amazon/` — `snapshot.ts` (contract), `reconcile.ts` (persist),
  `import.ts` / `parse.ts` / `slim.ts` (privacy zip), `allocate.ts`, `match.ts`, `grouping.ts`,
  `ordersQuery.ts`, `amazonFields.ts`, `queries.ts`, `types.ts`.
- **Relevance:** `amazonGroupPaidCents` in `grouping.ts` is the read-time sum this spec
  replaces; `allocateCharge` in `allocate.ts` is the smearing this spec corrects.

### Orders UI

- **Location:** `src/components/amazon/` — `AmazonOrdersView.tsx`, `amazonColumns.tsx`,
  `AmazonReviewDrawer.tsx`, `AmazonSnapshotPanel.tsx`.
- **Relevance:** windowed grid, group totals, capture modal and review drawer.

### Browser capture

- **Location:** `scripts/amazon-subscribe-save.user.js`; siblings
  `scripts/capitalone-pending.user.js`, `scripts/chase-pending.user.js`.
- **Relevance:** the extraction to rewrite, and the established pattern — authenticated browser
  read, tagged clipboard text, authoritative Planner parser, no cross-site POST.

### Split and money helpers

- **Location:** `src/lib/finances/splitRemainder.ts`, `src/lib/finances/money.ts`,
  `src/lib/finances/mutations.ts`, `src/lib/finances/billLastCharge.ts`.
- **Relevance:** `distributeRemainder` is the exact-cent allocator both tax and the subscription
  saving must use; `centsToNumericString` / `numericStringToCents` are the storage boundary.
