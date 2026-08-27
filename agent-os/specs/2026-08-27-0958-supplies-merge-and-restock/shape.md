# Supplies — merge items and restock columns — Shaping Notes

**Status: frozen / complete** (2026-08-27)

## Scope

Two follow-ups on the shipped Supplies worksheet (`2026-08-26-0910-supplies-worksheet`):

1. **Merge items**, especially duplicates created from Amazon (one item per ASIN, so a 12-pack and a 24-pack of the same drink are two items). Plus an Amazon entry path that can attach an offer onto an existing item, so the duplicates do not have to be created in the first place.
2. **Lasts** and **Packs/mo** columns — how long one purchase lasts, and how many of that pack you go through in a month. Derived from the rate already on the item and the qty already on the offer.

### Out of scope

- Matching supply items to `finance_transactions`, or any write into the budget.
- Inventory / on-hand / reorder point / next-order date — that is a stock model, not a derived column.
- Auto-merge by similar name, or averaging two inferred rates.
- Re-syncing Amazon prices onto existing options (worksheet D6).
- A supply-item drawer.
- Changing how the inferred Amazon rate is computed.

## Decisions

Full statements are D1–D4 in `plan.md`. The shaping that produced them:

**Merge is the Payees operation, not a new kind of thing.** Lee already has a preview-then-confirm merge that rewrites references and deletes sources. Supplies is simpler: the only references are the option rows, and there is no claim/schedule conflict to refuse. The one trap is the partial unique index on `in_use` — a naive reparent would try to put two in-use offers on one item. Clear source flags; keep the target's; promote only if the target has none.

**Amazon attach is how D1 survives the ingest path.** The original worksheet treated Amazon as "create an item". That is correct for the first time you track something, and wrong the second time the same consumable shows up as a different ASIN. Add stays; Add to… is the missing verb. The item's rate is not overwritten — the Amazon number is a guess, and an existing item may already have a corrected one.

**Lasts + Packs/mo, not Packs/biweek and not inventory.** The question at the store is "how long will this last, and how many do I go through a month." Biweekly packs were offered (payday cadence) and declined. Ceil-to-whole-packs was considered and declined: 1.33 is the honest rate.

**Merge has to live in the Item menu.** Supplies currently has no `commandCapabilities` — New item and Suggest from Amazon are toolbar-only. Navigation forbids shipping a command that has no menu home, and a phone cannot Shift-click, so the Payees pick-sheet comes along.

## Context

- **Visuals:** None. Shape from the existing Supplies grid and the Payees merge dialog.
- **References:** See `references.md`.
- **Product alignment:** Delta on the shipped Supplies worksheet (roadmap § Financial planning, itemized receipts / purpose-not-vendor). Not a new roadmap item. D1 and D6 of the parent spec carry forward unchanged.

## Standards Applied

See `standards.md`.
