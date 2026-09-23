# References for One history source per account

## Governing specs

### `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/` (active)

- **Relationship:** supersedes **D4** only in how feed-covered is decided (the stored history
  source, not the presence of a link).
- **Carries forward:** ledger-derived Ready to Assign (D1), per-account openings (D2), mismatch
  warnings (D3) and Reconcile (D5). These are the safety net for this spec's direction of error
  (a missing charge).

### `agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/` (active)

- **Relationship:** supersedes **D2** for `bank_page` accounts: `recentPosted` rows become
  history.
- **Carries forward:** D1 completeness scoping (coverage in D7 here relies on it), D3 (holds kept
  when unlisted), D4 restore, D5 SimpleFIN carry (still applies to 360 and Chase).

### `agent-os/specs/2026-09-01-1205-source-as-of-authority/` (frozen)

- **Relationship:** supersedes D1's placement of the derived headline cache
  (`bank_account_links` → `finance_accounts`). The authority rule and its single writer
  `recomputeAccountBalanceAuthority` are unchanged.

### `agent-os/specs/2026-09-13-1127-ingest-by-identity/` (frozen)

- **Relationship:** extends. `pairRows` / `resolveLostHold` remain for SimpleFIN accounts.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`, `2026-08-16-1556-capitalone-pending-scrape/`, `2026-08-18-1645-chase-pending-scrape/`

- **Relationship:** extends (Capital One capture format and audit); the Chase scrape is retired.

### `agent-os/specs/2026-08-15-1315-live-bank-sync/` (frozen)

- **Relationship:** extends. Links and sync stay; a sync skips non-`simplefin` accounts.

### `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` (frozen, since removed)

- **Relevant:** the earlier date-boundary ownership model. `history_source_since` is a
  per-account version of that boundary, applied once at cutover instead of moving on every sync.

## Similar implementations

### Snapshot planning and apply

- **Location:** `src/lib/finances/bankSnapshotReconcile.ts`, `src/lib/finances/bankSnapshotApply.ts:430-460`
- **Relevance:** the `feedCovered === false` branch is the page-authored posted path this spec
  re-enables for Capital One. The link guard at `:440-453` is what D2 removes.

### Headline authority

- **Location:** `src/lib/finances/sourceStateWrite.ts` (`recomputeAccountBalanceAuthority`),
  `src/lib/finances/sourceAuthority.ts`
- **Readers to move:** `src/lib/finances/queries.ts:187-208`, `src/lib/finances/import.ts:204-221`,
  `src/lib/banksync/queries.ts`.

### Userscript

- **Location:** `scripts/capitalone-pending.user.js:195-235`
- **Relevance:** already expands every row and reads Purchased/Posted from `row.innerText`;
  "Appears on statement as" is in the same text.

### Cutover script pattern

- **Location:** `scripts/single-pool-cutover.ts`, `scripts/scrape-duplicate-report.ts`
- **Relevance:** dry-run receipt first, apply only after Lee reads it.

### File import dedup

- **Location:** `src/lib/finances/import.ts:600-640` (`selectNewAgainstMixed`)
- **Relevance:** where the D7 coverage gate goes for `bank_page` accounts.
