# References

**Status: frozen / complete (2026-08-29)**

## Governing specs

- `agent-os/specs/2026-08-15-1315-live-bank-sync/`
- `agent-os/specs/2026-08-16-1556-capitalone-pending-scrape/`
- `agent-os/specs/2026-08-18-1645-chase-pending-scrape/`
- `agent-os/specs/2026-08-22-1948-zero-based-budget/`
- `agent-os/specs/2026-08-26-2022-split-transactions/`

## Existing code boundaries

- `scripts/chase-pending.user.js`, `scripts/capitalone-pending.user.js` — extraction and
  clipboard-only delivery.
- Deleted `src/lib/finances/capitalOnePending.ts` and `scrapePending.ts` — the old parser and
  replace-set implementation superseded by this delta.
- `src/lib/finances/liveFeedMatch.ts`, `matchExisting.ts` — established cross-source matcher
  and one-to-one matching patterns.
- `src/lib/finances/workingPending.ts`, `workingPendingQuery.ts` — shared pending authority.
- `src/lib/banksync/sync.ts`, `src/lib/finances/import.ts` — sync/import transaction boundaries
  and deduplication.
- `src/lib/finances/budget/queries.ts`, `budget/mutations.ts` — budget checkpoints and legacy
  movement notes.
- `src/components/grid/DataGrid.tsx`, finance drawers, and `src/lib/navigation/pages.ts` —
  Activity surface patterns.

## External semantic reference

- `docs/actual-budget/README.md` and the mapped files under `../actual` for budget math.
