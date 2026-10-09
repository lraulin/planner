# Delete transactions and edit payee aliases over MCP

**Status: active**
Spec folder: `agent-os/specs/2026-10-01-1040-mcp-transaction-delete-and-payee-aliases/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-09-1130-agent-tool-contracts/` (registry, strict schemas,
  effects classification, not_found for foreign ids).
- **Extends:** `agent-os/specs/2026-08-14-1208-finance-agent-tools/` (finance domain tools).
- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` (alias uniqueness lives in the
  database; `payee_id` is recomputable from aliases).
- **Extends:** `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/` (aliases are
  `normalizeMerchant` output, never a raw bank line).

## Context

Two jobs Lee does in the app have no agent path:

1. **Remove a wrong row.** A stale twin, a test row, or (after the card-alert work) an alert hold
   that will never post. Today the agent can only point at the row and ask Lee to delete it.
2. **Teach a payee a new spelling.** A purchase alert says "YouTube"; the posted row says
   `PP*GOOGLE YOUTUBE SUBSCRI` and resolves to payee "Google Youtube Subscri". Adding `YOUTUBE`
   to that payee is a Payees-page edit with no MCP equivalent.

Two existing paths also change aliases without recomputing `payee_id`, which the payees spec
says must never happen: the Payees page's alias remove (`removeAlias`) and the legacy
`upsert_subscription` matcher path (`addAlias` without a reclassify). And deleting a transaction
leaves its transfer partner pointing at a `transfer_group_id` nobody else holds until the next
import happens to reclassify.

## Decisions

### D1: `delete_transaction` is all-or-nothing, explicit, and audited

- Input `ids` (1–25 top-level transaction ids), optional `reason` (≤200 chars, recorded in the
  audit summary), `dryRun` (default false).
- A missing **or foreign** id fails the whole call with `not_found` naming the ids; nothing is
  deleted. A split child fails with `validation` ("delete its parent"): deleting one child would
  break the parent's sum, and the parent's delete takes its children by cascade.
- One database transaction: delete, then re-run the in-transaction reclassify so a surviving
  transfer partner is re-paired or released, then write the `transaction_delete` audit event with
  origin **Agent** and before/after money checkpoints.
- The receipt names each deleted row (account, date, description, signed cents, pending, source
  label, category, split children), the Ready to Assign delta for the current month, the audit
  event id, and warnings.
- **Warning, not refusal, when the source can bring the row back.** Rows have no tombstone
  (`2026-09-20-1216-holds-are-never-deleted-by-absence` scope), so a row whose source still
  writes that account may return on its next import, without its category. The receipt says so.
- `dryRun: true` resolves and validates everything, returns the same receipt with
  `deleted: false`, and writes nothing.
- Effects: destructive write, explicit confirmation.

### D2: `update_payee_aliases` adds, moves, and removes aliases, then recomputes

- Input: `payeeId`; `add` (raw strings, normalized with `normalizeMerchant`);
  `addFromTransactionIds` (the alias that row's description produces); `remove` (aliases on this
  payee, normalized the same way); `onConflict` `refuse` (default) or `move`; `dryRun`.
- An input that normalizes to empty → `validation`. A removal not on this payee → `not_found`.
- An alias held by another payee → `conflict` naming that payee, unless `onConflict: "move"`.
- **A move never takes an alias off a payee an envelope claims** → `conflict`. A silent move
  would take charges off a commitment, which is the reason `addAlias` refuses moves at all.
- The alias writes and the in-transaction reclassify run in one database transaction; the
  receipt counts re-linked rows and samples up to ten rows that now resolve to the payee. After
  commit the standard reclassify mints payees for merchants a removal orphaned (the receipt names
  where each removed alias went) and `applyPayeeAutoCategories` files only **uncategorized** rows
  of this payee. Existing categories always win.
- `dryRun: true` runs the same transaction and rolls it back; nothing persists.
- Retry-safe: adding an alias already on the payee is reported as `unchanged`.
- No `merge_payees` tool. Moving the aliases covers the alert case; merging two payees with
  claims is a page decision.

### D3: Every alias edit recomputes `payee_id`

`removePayeeAlias` (new, in `payees/aliases.ts`) replaces the page action's direct `removeAlias`,
and the legacy `upsert_subscription` matcher path reclassifies after it adds aliases.

### D4: `list_payees` reports `transactionCount`

Additive output field so an agent can pick the payee that actually holds the history before
editing aliases.

## Acceptance

- [ ] `delete_transaction` deletes the user's rows and their split children in one transaction,
      audits with origin Agent, and returns the receipt.
- [ ] A foreign or missing id deletes nothing and returns `not_found`; a split child returns
      `validation`.
- [ ] Deleting one side of a transfer releases the partner's `transfer_group_id`.
- [ ] `dryRun` on either tool writes nothing (no rows, no aliases, no audit events).
- [ ] An alias add re-links matching rows and fills only uncategorized rows from the claim.
- [ ] A conflicting alias is refused by default; `move` works off an unclaimed payee and is
      refused off a claimed one.
- [ ] Removing an alias splits its rows onto a payee of their own, reported in the receipt.
- [ ] The Payees page remove and `upsert_subscription` recompute `payee_id`.
- [ ] A second user cannot read, delete, or edit through either tool.
- [ ] `docs/agent-api.md` regenerated; registry and MCP catalog tests list both tools.

## Tasks

1. Save spec documentation (this folder).
2. Transaction delete with receipt, transfer re-pair, and Agent origin; `delete_transaction` tool.
3. `update_payee_aliases` and the two alias paths that skipped the recompute.
4. `list_payees.transactionCount`, generated docs.

## Changes from original plan

| What | Why |
| ---- | --- |
