# References for Ledger Ready to Assign

## Governing specs

### `agent-os/specs/2026-08-24-2206-single-pool-budget/`

- **Relationship:** supersedes D3 (RTA reconciles to the pool) and D5 (opening rebase on membership).
- **Carries forward:** D1 core accounts on-budget, D2 working-balance pool (now diagnostic), D4, D6.

### `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/`

- **Relationship:** supersedes only the `Account reconciliation` term; equation layout and the
  uncategorized amber line stay and are the pattern for the new mismatch line.

### `agent-os/specs/2026-09-13-1127-ingest-by-identity/`

- **Relationship:** supersedes D2's insertion direction and "Direction of error"; D3b's successor
  rule changes from description-gated to description-ranked. D1, D3a, D4 (sync window), D5 stay.
- **Note:** its D2 text calls description overlap a _tiebreak_, but `feedPairing.ts` implements it
  as a hard filter. This spec resolves that mismatch for hold succession only.

### `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` (via commit d728ac79)

- **Relevance:** records why page display names cannot be derived from feed descriptors and chose
  "missing, never doubled". D4 here returns to that direction by source rather than by date.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** extends — audited page captures, complete pending set.

## Similar implementations

### Budget fold

- **Location:** `src/lib/finances/budget/envelope.ts` (`buildBudget`, `applyAssignedInFuture`),
  `budget/queries.ts` (`loadBudget`, `openingPositionFor`), `budget/membership.ts` (identity check).
- **Parity:** `../actual/packages/loot-core/src/server/budget/envelope.ts` via
  `docs/actual-budget/README.md`.

### Bank snapshot and pairing

- **Location:** `src/lib/finances/bankSnapshotReconcile.ts` (`planBankSnapshotReconciliation`),
  `bankSnapshotApply.ts`, `feedPairing.ts` (`pairRows`, `resolveLostHold`), `liveFeedMatch.ts`
  (`descriptionsOverlap`, `dateDistance`), `bankSnapshot.ts` (card amount negation),
  `scripts/chase-pending.user.js` (`AMOUNT`, `rowFromCells`).

### Statements and ledger balance

- **Location:** `src/lib/finances/reconcile.ts` (statement-anchored balance), `queries.ts`
  (`listAccounts`: `balanceCents`, `ledgerBalanceCents`, `balanceMismatchCents`).
- **Relevance:** statement-first opening seed and per-account mismatch.

### Cutover script

- **Location:** `scripts/single-pool-cutover.ts`.
- **Key patterns:** dry-run/apply, before/after receipt, idempotence, abort on identity failure.

### Audit

- **Location:** `src/lib/finances/audit/checkpoints.ts`, `components/finances/activity/*`.
- **Relevance:** checkpoints and Headline impact must report RTA, not only the pool.
