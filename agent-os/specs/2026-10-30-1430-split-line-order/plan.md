# Split line order — Plan

**Status: frozen / complete** — verified 2026-10-30. Standards as of `8877343e`.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-26-2022-split-transactions/` — D8 reads children "in the
  order they were written"; this delta stores that order instead of inferring it.

## The bug

`listSplitChildren` ordered by `created_at, id`. Every split write inserts its children inside
one transaction, and `created_at` defaults to `now()` — the transaction's start — so all of a
split's lines tied and the random UUID decided their order. The agent tool's
`budgetTools.integration.test.ts` caught it about one run in three. Even without the tie, an
edit that keeps one line and adds another would list the new line last wherever the caller put
it, so creation time was never the right key.

## Decision

- `finance_transactions.split_position integer`: 0, 1, 2… in the order the caller listed the
  children. A check constraint holds it null exactly when `parent_id` is.
- `writeSplitChildren` renumbers every child on every write, kept ones included. The caller's
  list — the drawer's draft order, the agent tool's `splits` array — is the order.
- `listSplitChildren` orders by `split_position` alone; the writer makes it unique per parent.
- Migration `0106_split_line_position` backfills existing children by the old
  `created_at, id` order, which is what each was last read in.

No unique index on `(parent_id, split_position)`: the writer renumbers row by row, which
passes through duplicate positions mid-transaction, and Postgres cannot defer a unique index.

The feed handover moves a parent's children wholesale onto the replacing row, so positions
travel with them unchanged.

## Verification

- `mutations.integration.test.ts` › "lists children in the order the caller gave them, across
  edits" — puts a new line first and reorders kept ones; fails deterministically against the
  old `ORDER BY`.
- The agent split test passed 15 runs in a row; full `npm test` with integration.
