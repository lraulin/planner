# Supplies merge keeps product names on each offer line

**Status: frozen / complete** (2026-08-27)
Spec folder: `agent-os/specs/2026-08-27-1041-supply-merge-keeps-product-names/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/`
- **Supersedes:** `agent-os/specs/2026-08-27-0958-supplies-merge-and-restock/` — **only** the part of D1 that discarded source item names ("target keeps name… source items delete"). Merge still folds items into one survivor with one rate. What it must not fold away is the specific product title on each offer line.

## Context

Amazon create wrote the product title onto the item and left `brand` empty. Compact view then shows a named parent and a blank offer row — the C4 screenshot vs Canned Cat Food / Fancy Feast Grilled. Merge deleted the source item, so the only copy of "C4 24ct" vanished.

Lee's correction: those titles **are** the specific items and stay on each line. The generic name (Energy Drink, Cat Food) is a **group** he types himself.

## Decisions

- **Brand holds the specific name.** Empty brand on merge (and on Amazon new-item create) is filled from the item name. A brand that is already set is not overwritten.
- **Group holds the generic name.** Merge does not invent or rewrite `groupLabel`. The Group column already exists.
- **Item name of the survivor is unchanged** — he can rename "C4 Performance Energy Drink…" to whatever, or leave it, after the offer lines already carry the titles.

## Acceptance criteria

- [x] Merging two Amazon-created items (empty brand, title on the item) leaves both titles as option brands under the survivor.
      `merge.test.ts` — "takes the item name when Amazon left brand empty"; the write is covered by
      "reparents options onto the survivor, keeps one in-use, and deletes sources".
- [x] Merging items whose brands are already set (Fancy Feast Grilled / Pate) does not replace those brands with the item name.
      `merge.test.ts` — "keeps a brand that is already set"; `mutations.integration.test.ts` —
      "does not overwrite a brand that was already the specific product name".
- [x] Suggest from Amazon **Add** and Orders → New item write the product title onto the offer's brand, not only the item name.
      `SuggestFromAmazonDialog.tsx`; `mutations.integration.test.ts` — "puts the product title on
      the offer line when creating a new item".
- [x] A second user still cannot merge the first user's items.
      `mutations.integration.test.ts` — "does not let a second user preview or merge another user's items".

## Changes from original plan

| #   | Change                                                                                        | Why                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Acceptance was ticked at freeze (2026-08-27) against the tests, hours after the code shipped. | `1e87555` landed the whole change with unit and database coverage for all four criteria; nothing was left for a later pass. Each criterion above names the test that pins it. |

## Task 1: Save spec documentation

- [x] This folder.

## Task 2: Preserve brands in merge and Amazon create

`preservedOptionBrand` in `merge.ts`. Merge fills empty brands from item names before deleting sources. Amazon prefill and Suggest-from-Amazon Add set `brand` to the product title. Tests in `merge.test.ts` and `mutations.integration.test.ts`.

## Task 3: Verify

`npm run test:unit` for `merge.test.ts`. `npm run test:integration` with Postgres up for the mutation cases. Lint/typecheck. Compact Supplies: C4 offer lines show the product title; after merge, both pack sizes still named; group stays his to type.
