# References for ingest by identity, not by date

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/`

- **Relationship:** Supersedes D1–D3 (watermark decides ownership; snapshot drops posted rows at
  or before it; sync retires the covered tail). Extends D4 (user state crosses the handover) with
  a stricter matcher. D5–D8 unchanged.

### `agent-os/specs/2026-09-01-1205-source-as-of-authority/`

- **Relationship:** Supersedes D2 only for the file-day vs instant same-day tie. D1, D3–D5 carry
  forward.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends — the complete pending page set is the authority that removes holds;
  audit events carry the receipts and warnings this spec adds to.

### `agent-os/specs/2026-08-31-1444-separate-finance-authority-state/`

- **Relationship:** Extends — each ingestion path owns only its own facts.

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends — the sync window and `syncedThrough` meaning change (D4).

### `agent-os/specs/2026-08-24-2206-single-pool-budget/`

- **Relationship:** Context only — D3's pool identity and reconciliation term are how the defects
  surfaced; unchanged.

## Similar implementations

### Live-feed matching

- **Location:** `src/lib/finances/liveFeedMatch.ts`
- **Relevance:** `dateDistance` (four date-axis pairings), `descriptionsOverlap`,
  `DATE_TOLERANCE_DAYS`, occurrence counting — the pairing module reuses these.

### Feed handover

- **Location:** `src/lib/finances/feedHandover.ts`, `feedHandoverWrite.ts`
- **Relevance:** `carryableFields`, split move, audit changes — kept; the date-coverage selection
  and per-row unbounded matching are what change.

### Bank snapshot reconciliation

- **Location:** `src/lib/finances/bankSnapshotReconcile.ts`, `bankSnapshotApply.ts`
- **Relevance:** posted duplicate/transition/insert paths and the complete-pending-set deletion;
  `splitByWatermark` is replaced by pairing.

### Approximate amount band

- **Location:** `src/lib/finances/amountMatch.ts` (`amountMatches`, Actual's 7.5%)
- **Relevance:** the lost-hold carry rule.

### Sync window and source authority

- **Location:** `src/lib/banksync/sync.ts` (`OVERLAP_DAYS`, `syncedThrough`),
  `src/lib/banksync/crossSource.ts` (`syncWindow`), `src/lib/banksync/mapping.ts`
  (`balanceAsOf`), `src/lib/finances/sourceAuthority.ts` (`isStrictlyNewer`),
  `sourceStateWrite.ts`, `importedPostedBalance.ts`.
