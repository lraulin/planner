# References for feed ownership: SimpleFIN owns history, the browser snapshot owns the tail

## Governing specs

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends; supersedes D2's posted-side cross-source matching.
- **Carries forward:** the versioned complete-snapshot contract and its fail-closed parsing,
  atomic application in one transaction, the 36-hour browser-pending authority window, and the
  append-only finance audit with its money checkpoints.
- **Changes:** incoming posted rows are no longer matched against posted history by
  exact-amount / description-overlap / ±2-day comparison. Ownership is decided by date against
  the feed watermark.

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends; supersedes narrowly.
- **Relevant decisions:** SimpleFIN stays a historical/reconciliation source against existing
  account rows. Its cross-source matcher stops being how SimpleFIN and browser capture tell
  their rows apart; it is not removed from the codebase for other callers.

### `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/`

- **Relationship:** Supersedes D3 narrowly.
- **Relevant decisions:** D3 makes a claim mean "this merchant's charges belong to this
  envelope", and routes Track as bill, New bill…, Review, the payee picker and the agent tool
  through one filing implementation (`payees/claims.ts`). That single implementation stays; for
  a **bill** envelope it now files only charges matching the bill's own amount and cadence.
  D7's learned/fixed payee default is untouched and is what a non-matching charge falls through
  to.

### `agent-os/specs/2026-08-26-2022-split-transactions/`

- **Relationship:** Extends.
- **Relevant decisions:** split state moves only when it transfers without changing financial
  meaning; a split that cannot move safely is reported rather than silently rewritten. D4 of
  this spec applies the same rule across a feed handover.

### `agent-os/specs/2026-08-16-1556-capitalone-pending-scrape/`, `agent-os/specs/2026-08-18-1645-chase-pending-scrape/`

- **Relationship:** Already superseded by the 2026-08-29 snapshot spec. Listed only so the
  chain is followable.

## Similar implementations

### Bank snapshot reconciliation

- **Location:** `src/lib/finances/bankSnapshotReconcile.ts`, `bankSnapshotApply.ts`,
  `bankSnapshot.ts`
- **Relevance:** where ownership by watermark replaces matching by description.
- **Key patterns:** occurrence-counted one-to-one matching (keep it for same-amount same-day
  charges within one feed), the plan/apply split, and application inside one transaction with
  its audit event.

### Cross-source matcher

- **Location:** `src/lib/finances/liveFeedMatch.ts` (`descriptionsOverlap`, `dateDistance`,
  `DATE_TOLERANCE_DAYS`)
- **Relevance:** the heuristic being taken off the money path. Still available for the
  best-effort state carry-over in D4, where a miss is harmless.

### Payee claims and auto-categorisation

- **Location:** `src/lib/finances/payees/claims.ts`, `src/lib/finances/payees/autoCategory.ts`
- **Relevance:** `applyPayeeClaims` is the single filing implementation D5 narrows;
  `categoryForNewTransaction` is where claim-beats-default is decided.
- **Key patterns:** `uncategorizedOnly` marks the ingest path (new rows only, never a later
  manual correction); off-budget accounts and internal transfers are never filed.

### Bill facet

- **Location:** `src/db/schema.ts` — `financeBudgetCategories` (`expectedCents`,
  `cadenceMonths`, `cadenceDays`, `dueDay`), and `src/lib/finances/billLastCharge.ts`
- **Relevance:** supplies "what this bill costs and how often", which D5's match needs.
  `expectedCents` null means "median of the charges on file".

### Register columns

- **Location:** `src/components/finances/financeColumns.tsx`; labels in
  `src/lib/finances/types.ts` (`FEED_LABELS`)
- **Relevance:** the Source column follows the existing `sourceCategory` / `posted` column
  definitions.

### Userscripts

- **Location:** `scripts/chase-pending.user.js`, `scripts/capitalone-pending.user.js`
- **Relevance:** D7 and D8. Capital One already gates on the
  "Posted Transactions Since Your Last Statement" heading (`isCurrentCycleRow`); Chase needs
  the equivalent gate on its period selector, and its `rowFromCells` category extraction is
  what produces `"CVSCVS"`.
