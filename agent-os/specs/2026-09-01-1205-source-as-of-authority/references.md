# References for Source currency

## Governing specs

### `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/`

- **Relationship:** Extends — D1–D4 unchanged.
- **Relevant decisions:** D1/D2 give the two feeds disjoint date ranges by watermark; D3
  retires the browser tail on sync and import; D4 carries user-owned state across the
  handover. **Row ownership is settled here and this delta must not disturb it.** D2's
  chosen direction of error — prefer a missing row over a double-counted one — is the same
  principle behind "ties keep the incumbent".

### `agent-os/specs/2026-08-31-1444-separate-finance-authority-state/`

- **Relationship:** Supersedes D1, D2, D3; extends D4, D5.
- **Relevant decisions:** D1 split one timestamp into `provisionalBalanceAsOf` and
  `browserPendingAsOf` and deliberately kept two separate 36-hour constants; D2 set which
  path may write which; D3 put each behind its own pure predicate. All three are replaced by
  per-source stamps and one comparison. D4's backfill-from-audit-evidence approach is the
  model for this delta's backfill; D5's requirement to audit an authority transition even
  when no money moved still applies.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends; supersedes D2 narrowly.
- **Relevant decisions:** D1's versioned complete-snapshot contract and D2's atomic
  reconciliation carry forward untouched. Only D2's **36-hour browser-pending authority
  window** is replaced. D3's append-only audit remains how an authority change is explained.

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends.
- **Relevant decisions:** SimpleFIN as historical/reconciliation source; linked accounts are
  existing account rows.

## Reference implementations

### The as-of that already exists

- **Location:** `src/lib/banksync/mapping.ts:100-120`
- **Relevance:** `balanceAsOf()` already reads SimpleFIN's `balance-date` and documents why
  it is preferred over the request time. This delta narrows its return to `Date | null`.
- **Key patterns:** `epochToDateKey`, and the deliberate comment that a stale figure stamped
  "now" is worse than no figure — the same reasoning the null stamp encodes.

### The comparison this generalizes

- **Location:** `src/lib/finances/importedPostedBalance.ts` — `importedPostedHeadline`
- **Relevance:** Already refuses to write when the file is older than the link's snapshot,
  by comparing as-of **dates**. It is the closest thing to the new rule and folds into it.
- **Key patterns:** `latestRunningBalance` derives a file's own as-of day from a
  running-balance column; that is the file source's stamp.

### The pure-rule-plus-writer shape to copy

- **Location:** `src/lib/finances/feedWatermark.ts` + `feedHandoverWrite.ts`
- **Relevance:** The pattern this delta should follow — a pure module holding the rule and
  its rationale, a thin write module that runs inside the caller's transaction and returns
  audit changes rather than writing its own event.

### The readers to re-key

- **Location:** `src/lib/finances/workingPending.ts`, `workingPendingQuery.ts`,
  `src/lib/banksync/queries.ts:233`, `src/lib/finances/queries.ts` (`listAccounts`)
- **Relevance:** Every consumer of `browserPendingAsOf` and the 36-hour predicate.
  `withheldBrowserPendingAccountIds` was added in `f122a06` and re-keys onto the new stamps.

### Modules this delta deletes

- **Location:** `src/lib/finances/provisionalBalance.ts`,
  `src/lib/finances/browserPendingAuthority.ts` (and their tests)
- **Relevance:** Both encode the elapsed-time model being replaced. They are the two
  workarounds that identified the missing concept.
