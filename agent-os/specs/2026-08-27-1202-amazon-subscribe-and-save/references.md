# References for Amazon Subscribe & Save bills and charge matching

## Governing specs

### `agent-os/specs/2026-08-14-1439-amazon-order-ingest/`

- **Relationship:** Extends receipt storage and supersedes only the no-ledger-write boundary.
- **Relevant decisions:** ASIN and `std-sns-us` identify S&S; Amazon rows are receipts rather
  than bank rows; browser/zip upserts may not erase user-owned fields.

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends.
- **Relevant decisions:** a Bill is `finance_budget_categories.kind = 'bill'`; its envelope is
  the transaction category and carries cadence, amount, anchor and status.

### `agent-os/specs/2026-08-26-2022-split-transactions/`

- **Relationship:** Extends its parent/children ledger model; supersedes automatic-split
  prohibition only for exact Amazon charge evidence.
- **Relevant decisions:** parent keeps bank amount and no category; children sum exactly;
  proportional remainder is the tax/fee allocator; nested splits are forbidden.

### `agent-os/specs/2026-08-26-0910-supplies-worksheet/`

- **Relationship:** Extends.
- **Relevant decisions:** ASIN belongs to an offer, item owns the envelope and consumption,
  Amazon is prefill rather than price sync.

### `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/`

- **Relationship:** Extends attach/merge behavior.
- **Relevant decisions:** an ASIN may sit on an offer under a generic Supply item; target-owned
  envelope survives merge. The active product-name delta changes display only.

## Similar implementations

### Bank pending userscripts

- **Location:** `scripts/capitalone-pending.user.js`, `scripts/chase-pending.user.js`, and
  `src/lib/finances/capitalOnePending.ts`.
- **Relevance:** authenticated browser extraction → tagged clipboard text → authoritative
  Planner parser, with no cross-site POST or bank credential.

### Amazon privacy import and Orders

- **Location:** `src/lib/amazon/` and `src/components/amazon/AmazonOrdersView.tsx`.
- **Relevance:** canonical order/item identity, Amazon-owned upserts, File import command,
  persisted Orders grid and ASIN-to-Supplies entry path.

### Bill and split domain writes

- **Location:** `src/lib/finances/mutations.ts`, `src/lib/finances/billLastCharge.ts`, and
  `src/lib/finances/splitRemainder.ts`.
- **Relevance:** canonical Bill validation, evidence-backed charge anchors, strict balanced
  split transaction, and proportional exact-cent distribution.
