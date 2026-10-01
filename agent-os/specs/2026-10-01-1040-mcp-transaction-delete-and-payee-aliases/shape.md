# Delete transactions and edit payee aliases over MCP — Shaping Notes

**Status: active**

## Scope

Two finance write tools for the MCP surface, shaped together with the card purchase-alert work
(its own spec, built on top of this one), which depends on both: an
alert hold that never posts needs a delete, and an alert's cleaned-up merchant name ("YouTube")
needs a way onto the payee its posted row resolves to.

### In scope

- `delete_transaction` (D1), `update_payee_aliases` (D2).
- The two alias paths that skip the `payee_id` recompute, and the transfer group a delete leaves
  dangling (D3, D1).
- `list_payees.transactionCount` (D4).

### Out of scope

- A `merge_payees` tool.
- Tombstones that stop a deleted row being re-imported. The receipt warns instead.
- Category edits over MCP. Categories follow from payee auto-filing only.

## Decisions (Lee, 2026-10-01)

- Build both tools in one PR ahead of the card-alert PR.
- `onConflict: "move"` is allowed, without a merge tool.
- No tombstones yet.
- Categories via payee auto-filing only: an alias edit never overwrites a category.

## Context

- `deleteTransactions` (`src/lib/finances/mutations.ts`) already audits a deletion with the whole
  row, so the audit restore path works for agent deletions too. It hard-coded origin "Register"
  and skipped the reclassify.
- `addPayeeAlias` (`payees/aliases.ts`) is the pattern: write, reclassify, then auto-file
  uncategorized rows for the payee.
- `finance_payee_aliases (user_id, alias)` is unique, so a move is an update of the existing row,
  not an insert.
