# References for Split transactions

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** D1 — a bill is an envelope, carried on
  `finance_budget_categories.kind`. This is what makes splits necessary rather than merely
  useful: one charge that pays two bills has to reach two envelopes, and
  `finance_transactions.budget_category_id` is a single FK.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** D6 (the transaction's envelope FK) and D1 (the envelope fold). The
  fold stores nothing derived, so splits must be correct at the row level or every balance is
  wrong. The `budget_category_id` schema comment establishes that the count of null envelopes
  **is** the reported discrepancy — which is why a split parent's null envelope has to be
  filtered out of `backlogSince` and not merely tolerated.

### `agent-os/specs/2026-08-24-1945-register-prepared-rows/`

- **Relationship:** Extends.
- **Relevant decisions:** The server-prepared index, 100-row detail blocks, and opt-in
  virtualization with fixed row heights. D8 is shaped entirely by not wanting to make every
  stage of that pipeline split-aware. Change #3 in its own table (tag chips clipped because
  virtual rows are a fixed `--row-height`) is the warning about what child rows must not do.

### `agent-os/specs/2026-08-23-0748-finance-payees/`

- **Relationship:** Extends.
- **Relevant decisions:** D4 — payee identity is derived from the description, corrected by
  alias edit, with deliberately no per-row override. A split child therefore inherits its
  parent's payee and cannot set one.

### `agent-os/specs/2026-08-14-1524-statement-reconcile/`

- **Relationship:** Extends.
- **Relevant decisions:** `opening + sum(rows) = closing` per statement period. This is the
  check that makes D6's strict balance the right call, and the reason reconcile's row set is one
  of the two audit answers in D2.

### `agent-os/specs/2026-08-23-1536-finance-rules/`

- **Relationship:** Explicitly **not** superseded.
- **Relevant decisions:** D4 — three rule actions, "no splits". That forbids a rule _creating_ a
  split and stays true. Its divergence table already notes Actual lets rules split amounts and
  that we do not.

### `agent-os/specs/2026-08-26-0910-supplies-worksheet/`

- **Relationship:** Unblocked by this spec, not extended.
- **Relevant decisions:** "Nothing here writes the budget: attributing one Walmart charge across
  several envelopes needs split transactions." Task 8 updates that note.

## Reference implementation — Actual Budget (`../actual`, MIT)

See `docs/actual-budget/README.md` for the file-by-file map.

### The parent/child schema

- **Location:** `packages/loot-core/src/server/aql/schema/index.ts:37-39, 366-403`
- **Relevance:** `is_parent` / `is_child` / `parent_id` on the transactions table itself, plus
  the views that hide orphaned children and null a parent's category
  (`CASE WHEN _.isParent = 1 THEN NULL`).
- **Key patterns:** The parent's null category (D3); joining children to a live parent so a
  tombstoned parent takes its children out of every read.

### The default leaf-row filter

- **Location:** `packages/loot-core/src/server/aql/schema/executors.ts:116, 242`
- **Relevance:** Actual appends `is_parent = 0` to grouped and aggregate queries by default.
  This is the direct source of D2's first row and the reason leaf-row summing needs no special
  case for non-split transactions.

### Split editing helpers

- **Location:** `packages/loot-core/src/shared/transactions.ts`
- **Relevance:** `makeChild` (what a child inherits — account, date, payee, cleared),
  `makeEmptySplitSubtransactions`, and `recalculateSplit` / `SplitTransactionError` (the balance
  check we make strict in D6).

### `Distribute`

- **Location:** `packages/desktop-client/src/components/transactions/TransactionsTable.tsx:3774`
  (handler) and `:2293-2345` (the "Amount left" popover).
- **Relevance:** The affordance D7 borrows and the algorithm D7 rejects — it spreads the
  remainder evenly across zero-amount children with the odd cents dealt one per child, which
  cannot allocate sales tax across children that already have amounts.

## Similar implementations in this repo

### PayPal resolutions — an opaque processor row explained by a second source

- **Location:** `src/lib/finances/paypalMatch.ts`, `paypalResolutions.ts`,
  `finance_payment_resolutions` in `src/db/schema.ts`
- **Relevance:** The nearest existing answer to "one bank string, many real payments". Its
  `PAYPAL_RAIL = /\bPAYPAL\b|^PP\*/i` already matches `PP*APPLE.COM/BILL`.
- **Key patterns:** Date + signed amount as identity with a posting window, occurrence-counted
  so identical rows each claim their own match; deterministic tiebreaks so two runs agree.

### Amazon order ingest — line items beside transactions, never rewriting `amount`

- **Location:** `src/lib/amazon/`, `amazon_orders` / `amazon_order_items` in `src/db/schema.ts`
- **Relevance:** The precedent for evidence tables that explain a charge. Deliberately _not_ the
  model chosen here: an order is a separate document, whereas a split is the transaction itself
  divided, and only rows in `finance_transactions` reach the envelope fold.

### The workarounds this replaces

- **Location:** `src/lib/finances/amountMatch.ts`; `src/lib/finances/registerBillDraft.ts:95`
- **Relevance:** Both exist because `PP*APPLE.COM/BILL` is many products. Neither is deleted by
  this spec — amount-as-identity is still how Track as bill finds a subscription's history — but
  the spec records that they were the two workarounds that identified the missing concept.

### Integer-cent discipline

- **Location:** `src/lib/finances/budget/envelope.ts` (the `cents()` assertion),
  `src/lib/finances/money.ts`
- **Relevance:** The allocator in D7 must land on an exact sum. `envelope.ts` throws on a
  non-integer because "a fraction that enters the opening position silently poisons every
  balance derived from it"; the same argument applies to a remainder allocation that is off by
  a cent.
