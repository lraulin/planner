# Supplies — merge items and restock columns

**Status: active**
Spec folder: `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-26-0910-supplies-worksheet/` — D1 (item owns consumption, option owns price; exactly one `in_use`), D2 (two rate bases), D4 (derived figures never stored), D5 (periods from cost-per-day), D6 (Amazon is a prefill, never a sync). This delta does not reopen those.
- **Extends:** `agent-os/specs/2026-08-26-2159-grid-aggregation-placement/` — group/footer totals stay the three money columns. Lasts and Packs/mo are not summed (summing days-a-pack-lasts across cat food and toothpaste is meaningless; summing packs of unlike things is too).
- **Extends:** `agent-os/specs/2026-08-23-0748-finance-payees/` and `agent-os/specs/2026-08-23-1041-payee-matcher-cutover/` — merge UX: pick a survivor, preview what moves, rewrite references in one transaction, delete sources. No `payee_mapping`-style indirection. Supplies has no claim/schedule JSONB, so there is no merge _refusal_ analogous to distinct envelope claims.
- **Extends:** `agent-os/specs/2026-08-14-1439-amazon-order-ingest/` — still a standalone surface; still does not write `finance_transactions`.
- **Supersedes:** nothing in the worksheet model. The Amazon _entry path_ is extended: Add may land as an option on an existing item, which is how D1 survives after creating from Amazon data.

## Context

The worksheet shipped 2026-08-26. Two gaps showed up in use:

1. **Duplicates after Amazon.** `Suggest from Amazon` and Orders → Add to Supplies create one item per ASIN. A 12-pack and a 24-pack of the same drink become two items, each with its own inferred rate — the state D1 exists to leave. Dedup today is ASIN-only (`knownAsins`), so different pack sizes never meet.
2. **Restock is missing.** Rate, hidden Units/mo, and Qty answer consumption and pack size. Biweekly/Monthly/Yearly answer cost. Nothing answers "how long will this purchase last?" or "how many of these packs do I go through in a month?"

This is a delta on the shipped page, not a new roadmap item. Nearest thread: Financial planning → itemized receipts / purpose-not-vendor. No budget writes; matching supply items to `finance_transactions` stays the parked follow-up.

## Decisions

### D1. Merge selected items, Payees-style

Multi-select → **Merge selected items…**. Pick the survivor. Preview, then one transaction:

- Source **options** reparent onto the target (`item_id` rewrite). ASINs travel with them, so later Suggest-from-Amazon still skips those products.
- Source `in_use` flags **clear** on the way (the partial unique index cannot hold two in-use offers on one item). The target's in-use offer stays. If the target has no in-use offer, promote the first source's in-use offer — same carry-across as payee claims onto an unclaimed target.
- Source **items delete** after the rewrite. Options must move first; `onDelete: cascade` would otherwise wipe them.
- Target keeps **name, rate, group, envelope, unit label, notes**. Differing source rates/groups/envelopes are discarded, not averaged, not refused. The preview names what is dropped so the user picks the survivor whose rate they trust.
- Selection **reduces to item roots**. Two offer rows under different items merge those items. Two offers under the same item: disabled, "Select two different items to merge."
- No schema change. No leftover mapping table.

### D2. Amazon can attach to an existing item

The merge is cleanup. Attach is prevention.

- **Suggest from Amazon:** each candidate keeps **Add** (new item, current path, inferred rate lands on the new item). Adds **Add to…** — pick an existing item; creates an option (vendor Amazon, qty/cost/ASIN/pricedOn from the suggestion, brand = product name so the offer is identifiable). **Does not change the item's rate** (D6: Amazon rate is a guess for new items; an existing item already has a rate the user may have corrected). `in_use` is false unless the target has no in-use offer.
- **Orders → Add to Supplies:** no longer one-click create when the worksheet already has items. A small picker: **New item** (current create, including the 30-days-per-unit placeholder for a single order) or an existing item (same attach mutation). Empty worksheet: still one-click new item — a picker of nothing is a trap.
- Duplicate ASIN still refused ("already on the worksheet"), whether the existing option sits on this item or another.

### D3. Lasts and Packs/mo are derived, never stored

Same rule as `$/unit` (worksheet D4).

```
daysPerPack   = qtyPerItem / unitsPerDay      // 42 cans at 4/day = 10.5 days
packsPerMonth = DAYS_PER_MONTH / daysPerPack  // ≈ 2.90 packs
```

Equivalent: `qtyPerItem * daysPerUnit`, and `unitsPerMonth / qtyPerItem`. Pin both ends in tests so a pack-size change moves Lasts and Packs/mo and **does not** move Rate — that is worksheet D1's orthogonality applied to restock.

Display: trim trailing zeros (10.5, 6, 2.9). **Do not ceil** Packs/mo — 1.33 is the honest rate; "buy 2 this month" is a shopping decision, not a column.

On the **item** row: in-use offer, live. Null (em-dash) when there is no in-use offer.
On **option** rows: what-if, greyed, same as Biweekly already does.

Default **visible**, inserted after Rate in `viewDefaults`. Units/mo stays off. The `known` column-set mechanism already surfaces new columns on saved layouts.

**Not aggregated** in group headers or the footer.

### D4. Merge is a menu command, not toolbar-only

`components/navigation.md`: a command without a menu is not shipped; unavailable is disabled with a reason, never hidden; plural verbs act on the on-screen selection reduced to roots.

Wire `commandCapabilities` on Supplies (it currently has none — New item / Suggest from Amazon are toolbar-only) with a `pageCommands` Merge entry, `menu: "item"`, `rowMenu: true`. Fewer than two distinct items: label "Select items to merge…"; on compact, a searchable pick sheet like Payees (`PayeeMergePickerDialog`), because a phone cannot Shift-click.

## Acceptance criteria

- [ ] Selecting two or more distinct items (or offers under them) and running **Merge selected items…** opens a preview that names the survivor, how many offers move, and which rates/groups/envelopes will be dropped. Confirming leaves one item; the others are gone; every source offer sits under the survivor; exactly one offer is in use; the unique index still holds.
- [ ] Merging into an item with no in-use offer promotes a source's in-use offer rather than leaving the survivor unpriced.
- [ ] A second user cannot merge, preview, or attach using the first user's ids.
- [ ] Suggest from Amazon **Add** still creates a new item. **Add to…** puts the offer on a chosen item without rewriting that item's rate, group, or envelope.
- [ ] Orders → Add to Supplies offers New item vs existing items when the worksheet is non-empty; one-click new item when it is empty; still refuses a duplicate ASIN.
- [ ] Lasts and Packs/mo show on the item (in-use pack) and greyed on offers. Fancy Feast 42ct at 4/day = **10.5 days** and **~2.9 packs/mo**. A 3-pack of 45-day tubes lasts 135 days. Changing Qty moves Lasts/Packs/mo and does not move Rate.
- [ ] Group and footer totals are still only Biweekly / Monthly / Yearly.
- [ ] Merge lives in the Item menu and the row menu, disabled with a reason when the selection is not two distinct items.
- [ ] `npm run test` (unit **and** integration — Postgres up), lint, typecheck, build, `npm run smoke`, and a browser pass on `/finances/supplies` plus Orders → Add to Supplies.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

- [x] Create `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/` with `plan.md` (this, **Status: active**), `shape.md`, `standards.md` (references, not copies; pin standards commit `cf6d34ce661d23605395540b39195296f7f9f868`), `references.md`. Empty visuals.

## Task 2: Restock math — `cost.ts` + `cost.test.ts`

Add `daysPerPack(rate, offer)` and `packsPerMonth(rate, offer)` next to `supplyTotals`. Optionally fold the two numbers onto `SupplyTotals` so the grid does not re-derive them.

Tests that fail on a plausible mistake:

- Cat food CSV row: 10.5 days, `DAYS_PER_MONTH / 10.5` packs.
- Energy 12ct at 2/day: 6 days.
- Toothpaste 45 days/tube, qty 1 vs qty 3: Lasts scales (45 vs 135), cost-per-day does not (already pinned); Packs/mo scales inversely.
- Zero rate or zero qty → 0, not Infinity.

## Task 3: `mergeSupplyItems` + isolation tests

`src/lib/finances/supplies/mutations.ts` (and a small pure helper if preview-shaping wants one, analogous to `payees/merge.ts` — here the only rule is "target wins, carry in-use if target has none").

```
mergeSupplyItems(userId, targetId, sourceIds) → { movedOptions: number }
previewSupplyMerge(userId, targetId, sourceIds) → { target, sources, movedOptions, … }
```

One transaction: require every id; reparent options with `inUse: false`; maybe promote; delete source items.

Integration tests (`mutations.integration.test.ts`):

- Happy path: two Amazon-style items (different ASINs, both in-use) → one item, two options, one in-use, both ASINs present, sources gone.
- Target with no options takes a source's in-use.
- Unique index still holds (a naive reparent that left two `in_use` would fail the test by throwing).
- Cross-user: second user fails to preview, merge, or attach using the first user's ids.
- Selecting the same item twice / empty sources is a no-op or a human sentence, not a write.

## Task 4: Attach Amazon offer to an existing item

`addSupplyOptionFromAmazon(userId, itemId, asin)` (name as fits): same ASIN-scoped aggregate as `addSupplyFromAmazonItem`, then `createSupplyOption` on `itemId`. Refuses duplicate ASIN. Does not call `updateSupplyItem`. First offer on an empty item is in-use.

`createSupplyItemFromSuggestion` stays for the new-item path.

## Task 5: Server actions

Thin wrappers on `src/app/finances/actions.ts`: `previewSupplyMergeAction`, `mergeSupplyItemsAction`, `addSupplyOptionFromAmazonAction`. Inline writes `{ revalidate: [] }` like the other supply patches. Merge/attach should return enough for the dialog to refresh the grid.

Orders' `addSupplyFromAmazonItemAction` stays for New item.

## Task 6: Lasts and Packs/mo columns

`suppliesColumns.tsx` + `SUPPLIES_COLUMN_IDS` + `viewDefaults()` (after `rate`, Units/mo still omitted). Format via `format.ts` (trimNumber). Item live / option greyed. No `groupTotals` / `footerTotals` keys.

`rows.ts` if totals grow the two fields — keep the arithmetic in `cost.ts`.

## Task 7: Merge dialog + command

`SupplyMergeDialog` on `ModalShell`, modelled on `PayeeMergeDialog`: survivor `<select>`, preview of offers-to-move and discarded rates/groups/envelopes, confirm.

`SuppliesView.tsx`:

- Distinct item ids from `selectedIds` (option → parent).
- `commandCapabilities` with Merge (`menu: "item"`, `rowMenu: true`). Disabled reason when `< 2` distinct items.
- Compact: pick-sheet if the command runs with fewer than two already selected (Payees `PayeeMergePickerDialog`).
- Row menu includes Merge.

## Task 8: Amazon Add to existing

`SuggestFromAmazonDialog`: **Add** unchanged; **Add to…** opens an item picker (`listSupplyItemsAction` is already on the page — pass the current items in, or fetch). After success, same "Added" state as Add.

Orders: ModalShell picker when `listSupplyItems` is non-empty; empty worksheet keeps today's one-click + navigate to `/finances/supplies`. Attach should also navigate — prefer navigate to Supplies so the new offer is visible, same as today.

Below `md`, pickers are full-screen sheets (`components/responsive.md`).

## Task 9: Verify, freeze spec, update roadmap

- Confirm acceptance criteria in the browser: merge two Amazon-created pack sizes; Add to… from the suggestion dialog; Add to Supplies from Orders onto an existing item; Lasts/Packs/mo against the cat-food numbers; group totals still money-only.
- `npm run test` with Postgres up, lint, typecheck, build, `npm run smoke` (touched `src/app/**`).
- Push — phone check on the deployed iPhone for merge + Add to… sheets.
- Update `plan.md` / `shape.md` for as-built drift; fill **Changes from original plan**.
- **Status: frozen / complete** (date). Follow-ups as new work, not edits.
- Roadmap: a short note under the existing Supplies bullet that merge + restock columns shipped, still not matching to `finance_transactions`.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Out of scope

- Matching supply items to `finance_transactions` / writing the budget.
- Inventory, on-hand counts, reorder points, next-order dates.
- Auto-merge by similar name, or averaging rates.
- Re-syncing Amazon prices onto existing options (worksheet D6).
- A supply-item drawer.
- Changing how the inferred Amazon rate is computed.
