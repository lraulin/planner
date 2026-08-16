# References for Capital One pending scrape

**Status: active**

## Governing specs

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends. Supersedes D5a only for the human scrape bridge.
- **Carries forward:** `pending` column; replaceable pending set; no `pending_transaction_id`; `applySync` deletes only `api:simplefin` ids; pending rows must be excluded from the comparison that would drop their posted replacement.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Extends.
- **Carries forward:** D2a — pending is added only on synced accounts. Scraped rows must land on the linked Cap One card.

## Similar implementations

### `src/lib/banksync/syncPlan.ts`

Pending vanish by id; the posted replacement is a new id. The pending row being deleted must be out of `selectUnmatched` or the posted insert is skipped.

### `src/lib/banksync/mapping.ts` `linkCandidates`

Account identity is trailing last-4 on `externalKey`. Do not create a second •••3448.

### `src/lib/finances/import.ts`

Insert-or-skip, never update. Scrape ingest is a different contract (replace set) and must not go through that path except as a detector that delegates to `replaceScrapedPending`.
