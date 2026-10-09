# References for delete transactions and edit payee aliases over MCP

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-09-1130-agent-tool-contracts/`

- **Relationship:** Extends — registry, schemas, effects, error codes.

### `agent-os/specs/2026-08-23-0748-finance-payees/`

- **Relationship:** Extends — alias uniqueness in the database; `payee_id` is recomputable and
  must be recomputed when aliases change.

### `agent-os/specs/2026-09-20-1216-holds-are-never-deleted-by-absence/`

- **Relationship:** Context — deletions are audited with the whole row so they can be restored;
  there are no tombstones.

## Code

- `src/lib/finances/mutations.ts` — `deleteTransactions`, `reclassifyTransactions`.
- `src/lib/finances/bankSnapshotApply.ts` — `reclassifyInsideTransaction`.
- `src/lib/finances/payees/mutations.ts` — `addAlias`, `removeAlias`, `cleanAlias`.
- `src/lib/finances/payees/aliases.ts` — `addPayeeAlias` (write → reclassify → auto-file).
- `src/lib/finances/payees/claims.ts` — `applyPayeeAutoCategories` (uncategorized rows only).
- `src/lib/agent/financeTools.ts` — `resolvePayeeIds` (legacy matcher path), `listPayeesTool`.
- `src/lib/agent/tools.ts`, `src/lib/agent/contracts.ts` — registry and schemas.
