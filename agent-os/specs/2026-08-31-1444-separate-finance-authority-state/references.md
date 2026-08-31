# References

**Status: frozen / complete** (2026-08-31)

## Governing intent

- `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` — complete browser pending
  snapshots are authoritative for 36 hours and every attempt is audited.
- `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` — SimpleFIN/file feeds own
  transactions through their watermark while browser feeds own the uncovered tail.
- `docs/actual-budget/README.md` — map to the Actual Budget reference for load-bearing
  envelope and working-balance semantics; those formulas are unchanged here.

## Current implementation seams

- `src/db/schema.ts` — `bankAccountLinks` and `financeAuditEvents`.
- `src/lib/banksync/scrapeBalance.ts` — overloaded freshness/precedence rule to split.
- `src/lib/banksync/mutations.ts` — SimpleFIN balance application and hold clearing.
- `src/lib/banksync/queries.ts` — pending-source authority during sync queries.
- `src/lib/finances/workingPending.ts` — Budget's browser-versus-SimpleFIN pending choice.
- `src/lib/finances/bankSnapshotApply.ts` — complete browser snapshot writer and audit event.
- `src/lib/finances/import.ts` — checking CSV headline-balance provisional hold.
- `src/lib/finances/queries.ts`, `src/lib/finances/types.ts` — account DTO surface.
- `src/components/finances/dashboard/DashboardView.tsx` — existing stale browser-snapshot
  warning.
- `src/app/finances/actions.ts` — thin server-action mapping that must follow the renamed
  DTO field.

## Relevant history

- `973a6e3` — made checking CSV imports advance a lagged SimpleFIN headline balance and
  exposed the adjacent coupling risk.
- Current implementation baseline and standards pin:
  `5ac7a20e7273d4efa20365d329f364c48f059f82`.

## Verification targets

- `src/lib/banksync/scrapeBalance.test.ts`
- `src/lib/finances/workingPending.test.ts`
- `src/lib/banksync/mutations.integration.test.ts`
- `src/lib/finances/bankSnapshotApply.integration.test.ts`
- `src/lib/finances/import.integration.test.ts`
- `src/lib/finances/budget/mutations.integration.test.ts`
