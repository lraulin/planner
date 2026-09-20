# References for holds are never deleted by absence

**Status: active**

## Governing specs

### `agent-os/specs/2026-09-13-1127-ingest-by-identity/`

- **Relationship:** Supersedes **D3a** (a hold the page no longer lists is removed on the next
  run). D3b (lost-hold carry) survives with a larger candidate pool. D1, D2, D4, D5 untouched.

### `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`

- **Relationship:** Extends — the `planner-bank-snapshot v1` format and the audit evidence record.

### `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/`

- **Relationship:** Extends **D4** (the page never authors posted history for a feed-covered
  account). D2 here relies on that guarantee.

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends — SimpleFIN's pending delete.

## Code

- `scripts/capitalone-pending.user.js:126-132, 175-200, 216-234` — heading whitelist and
  whole-document completeness checks.
- `scripts/chase-pending.user.js:314-333` — same audit.
- `src/lib/finances/bankSnapshot.ts:86-110, 348-368` — key allow-lists and completeness gate.
- `src/lib/finances/bankSnapshotReconcile.ts:267-304, 380-413` — successor scan and the delete.
- `src/lib/finances/bankSnapshotApply.ts:377-395, 557-581` — audit diff, carries, delete.
- `src/lib/finances/feedPairing.ts:100-147` — `resolveLostHold`.
- `src/lib/banksync/syncPlan.ts:176-188`, `mutations.ts:386-400` — SimpleFIN's pending delete.
- `src/db/schema.ts:2207-2216` (`postedAtBank`), `:2949-2974` (`financeAuditChanges`).
