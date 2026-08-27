# References for Supplies — merge items and restock columns

**Status: frozen / complete** (2026-08-27)

## Governing specs

### `agent-os/specs/2026-08-26-0910-supplies-worksheet/`

- **Relationship:** Extends. Frozen 2026-08-26.
- **Relevant decisions:** D1 item owns consumption / option owns price / exactly one `in_use` (partial unique index); D2 two rate bases enforced by CHECK; D4 derived figures never stored; D5 periods from cost-per-day; D6 Amazon is a prefill, never a sync, ASIN on the option so re-suggesting skips what exists. Follow-ups already named matching to `finance_transactions`, price history, and a drawer — none of those open here.
- **What this delta changes:** the Amazon _entry path_ (Add to an existing item) and two new derived columns. The model is unchanged.

### `agent-os/specs/2026-08-26-2159-grid-aggregation-placement/`

- **Relationship:** Extends. Frozen 2026-08-26. Supersedes the parent spec **only** on the form of the grand total (column-aligned footer row).
- **Relevant decisions:** Supplies group/footer totals sit in Biweekly / Monthly / Yearly. Lasts and Packs/mo must not join that set.

### `agent-os/specs/2026-08-23-0748-finance-payees/` and `2026-08-23-1041-payee-matcher-cutover/`

- **Relationship:** Extends, for merge UX and the "rewrite references, delete sources, no mapping table" rule. Frozen.
- **Relevant decisions:** D3 no `payee_mapping`; merge is one transaction. Cutover D7: merge is a multi-select command that picks a survivor and previews what moves. Distinct claims refuse a payee merge — Supplies has no analogue, so it does not refuse on differing envelopes; the target wins and the preview says so.
- **Compact path:** `2026-08-23-1041` change #6 and `PayeeMergePickerDialog` — a phone cannot rely on modifier-key selection, so Merge with fewer than two selected opens a searchable sheet.

### `agent-os/specs/2026-08-14-1439-amazon-order-ingest/`

- **Relationship:** Extends. Frozen 2026-08-14.
- **Relevant decisions:** standalone tables, do not write `finance_transactions`. Unchanged.

### `agent-os/specs/2026-08-25-0922-grid-checkboxes-bulk-category/`

- **Relationship:** Read for the plural-verb rule, not extended as a decision. Payees **Merge selected** is already multi and stays; this spec adds the same verb on Supplies, reduced to item roots.

## Similar implementations

### Payee merge — copy the dialog and the transaction shape

- **Location:** `src/lib/finances/payees/{merge.ts,mutations.ts,queries.ts}` (`mergePayees`, `previewPayeeMerge`), `src/components/finances/payees/{PayeeMergeDialog,PayeeMergePickerDialog,PayeesView}.tsx`, actions in `src/app/finances/actions.ts`.
- **Relevance:** the working merge in this app. Survivor `<select>`, server preview, one transactional rewrite, sources deleted, Item-menu command with compact pick-sheet.
- **Do not copy:** claim refusal, alias/transaction/schedule rewrite, `payee_mapping`. Supplies rewrites `finance_supply_options.item_id` and deletes `finance_supply_items`.

### Supplies worksheet — the page being extended

- **Location:** `src/lib/finances/supplies/{cost,mutations,queries,suggestions,rows,format}.ts`, `src/components/finances/supplies/{SuppliesView,SuggestFromAmazonDialog,suppliesColumns}.tsx`, `src/app/finances/actions.ts` (`createSupplyItemFromSuggestionAction`, `addSupplyFromAmazonItemAction`).
- **Relevance:** restock math belongs next to `supplyTotals`; merge next to `setSupplyOptionInUse` (same unique-index trap); attach next to `createSupplyOption`; columns next to Rate; Amazon dialog already commits per-row.
- **Key patterns:** `userId` first, `requireSupplyItem` / `requireSupplyOption` before writes, `{ revalidate: [] }` on inline actions, Units/mo omitted from `viewDefaults`, option rows greyed for what-if period costs.

### Orders → Add to Supplies

- **Location:** `src/components/amazon/AmazonOrdersView.tsx` (row action), `addSupplyFromAmazonItemAction` in `src/app/finances/actions.ts`.
- **Relevance:** today's one-click create, ASIN-scoped aggregate, duplicate-ASIN refusal, navigate to `/finances/supplies`. Task 8 wraps this in a picker when the worksheet is non-empty; empty worksheet keeps the one-click.

### Catalog command wiring

- **Location:** `src/components/grid/catalogCommands.ts` (`catalogCapabilities`, `pageCommands`), `PayeesView.tsx` `payees.merge`.
- **Relevance:** Supplies has no `commandCapabilities` today. Task 7 adds them so Merge has an Item-menu home; New item / Suggest from Amazon may stay on the toolbar.
