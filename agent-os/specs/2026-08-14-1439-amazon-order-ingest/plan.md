# Amazon order ingest + Orders page

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1439-amazon-order-ingest/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — money as `numeric(14,2)`, DataGrid register pattern, per-user isolation, provenance via `(externalSource, externalId)`, do not invent spend. Bank-CSV **insert-or-skip** does **not** carry over unchanged: Amazon dumps are full snapshots whose status fields change (see Decisions).
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — this is the parked “itemized receipts” follow-up. Do **not** write into `finance_transactions`, change `amount`, or recategorize Amazon card lumps in this spec.
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — add a built Finances page `orders` (`/finances/orders`) beside Register and Insights.
- **Does not supersede:** Insights interactive reports, recurring bills, envelopes, or merchant→category rules. Amazon stays “Shopping” on the register until a later matching spec attaches these line items.

## Context

Every Amazon card charge is one merchant lump. The register files it as Shopping. That hides the actual question: how much of Amazon is optional discretionary, and how much is toilet paper / cat food / coffee that would otherwise have been a grocery run (often via Subscribe & Save).

Lee’s Amazon privacy-request dump (`Your Orders.zip`, 2026-08-14) has the line items. It is not an ingest-ready file: ~550 entries, most of them delivery JPEGs and invoice PDFs. Useful CSVs:

| File                         | Rows                                 | Role                                                                                                       |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Order History.csv`          | 3,393 items / 2,605 orders           | Retail line items, 2000-09-11 → 2026-08-13                                                                 |
| `Digital Content Orders.csv` | 2,377 component rows / ~1,177 orders | Kindle, Prime, Audible, channel add-ons; exploded into Price/Tax rows; **no Order ID overlap** with retail |
| `Refund Details.csv`         | 62                                   | Completed refunds                                                                                          |
| `Returns Status.csv`         | 76                                   | Return/exchange resolution                                                                                 |
| `Replacement Orders.csv`     | ~70                                  | Original → replacement Order ID                                                                            |
| `Digital Returns.csv`        | 36                                   | Digital refunds                                                                                            |

Subscribe & Save is already in the retail file: shipping option `std-sns-us` (140 items, 2024–2026). Payment last-4 is on most retail rows (`Visa - 9910`, `Visa - 3448`, …) — that is what a later spec will match to card charges. `panda01` (208 rows, 20 orders, 2022) is restaurant/Fresh-style food in the same retail file; keep it, do not special-case it.

Roadmap § Financial planning already named this source (“Amazon order history / invoice export”) and forbade attaching line items until the register’s lumps were classified honestly. That precondition is met. This spec **chooses the data-request zip** and delivers the store + browse page. Matching and purpose tags stay the next spec.

**Achieve had no finance module.** Nothing in `docs/achieve-planner/` governs this.

## Decisions

- **Local preprocess, not browser unzip.** A repo script reads the zip (or an extracted folder), pulls only the CSVs above via `unzip -p` so JPEGs/PDFs never hit disk, and writes one slim JSON. The app ingests that JSON. Import is occasional; a CLI step is the right cost.
- **Slim JSON is the only ingest format.** Versioned (`version: 1`, `source: "amazon-data-request"`). The app never sees the zip. No new zip dependency.
- **Own tables, not `finance_transactions`.** `amazon_orders`, `amazon_order_items`, plus small refund/return/replacement tables. Roadmap: attach later without changing `amount` or inventing spend. No `transaction_id` FK yet.
- **One grid row per line item.** Orders page groups by Amazon Order ID. Digital is a `channel`, not a second page.
- **Collapse digital in the script.** Group by `Digital Order Item ID`. `itemPaid` = sum of `Transaction Amount` where `Component Type` is `Price Amount` (discounts arrive as negative Price rows). `itemTax` = sum where `Component Type` is `Tax`.
- **Store Amazon’s columns; do not reconstruct a “true” order total.** `Total Amount` is per-item paid. `Shipment Item Subtotal` and `Shipping Charge` are often shipment-level and repeated across lines. A later matcher uses date + last-4 + item/order amounts as-given.
- **Subscribe & Save** = `shippingOption === "std-sns-us"` (boolean column). No other SNS detector in this spec.
- **Drop PII and media.** No addresses, gift messages, tracking, serials, photos, invoice PDFs, reviews, sustainability. Keep last-4, product name, ASIN, amounts, dates, status, website, shipping option.
- **Re-import upserts Amazon-owned fields.** Deliberate difference from bank CSV insert-or-skip: a full dump’s `Authorized` rows become `Closed`, and there are no user-owned columns yet. When a later spec adds purpose/notes, those columns must be excluded from the upsert list. Dedup key `(userId, externalSource, externalId)`.
- **Cancelled / refunded items stay.** Status and the refund/return tables are how we later avoid treating them as spend. Do not drop them at import.
- **No matching, no purpose tags, no Insights changes.** The page can filter SNS / channel / status / year and search product names. That is enough to look at the data.
- **Fixtures are synthetic.** Do not commit the zip or live PII.

## Acceptance criteria

- [x] `npx tsx scripts/amazon-orders-slim.ts "/path/Your Orders.zip" -o amazon-orders.json` writes a version-1 slim file and does not extract JPEGs/PDFs
- [x] Slim file contains retail items, collapsed digital items, refunds, returns, replacements, and digital returns — not photos, invoices, reviews, or addresses
- [x] Digital Price+Tax component rows collapse to one item; paid is the Price-Amount sum (including negative discount rows)
- [x] Subscribe & Save items are flagged from `std-sns-us`
- [x] Settings → Import & export accepts the slim JSON; first import creates the expected counts; second import creates 0 rows and refreshes Amazon-owned status/dates
- [x] `/finances/orders` is a Finances page (Register \| Insights \| Orders) on the shared DataGrid: one row per item, groupable by order, sortable/filterable/searchable
- [x] Cancelled and refunded items are visible and distinguishable
- [x] A second user cannot read, change, or delete the first user’s Amazon rows
- [x] `finance_transactions` row count and amounts are unchanged by this import
- [x] Unit tests cover parse/collapse/SNS/dedup; integration tests cover import + upsert + cross-user; no React component tests
- [x] New route is on the smoke list; `npm run smoke` passes with the dev server up

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                  | Why                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Digital returns collapse on `Digital Order Item ID` (keep `Amount Refunded`, skip extra Price/Tax rows) | The dump explodes each digital refund the same way as Digital Content Orders; a naive row-per-line key duplicated `drefund:` ids and failed the unique index |
| 2   | Return `lineId` is `contractId:ordinal`                                                                 | Returns Status repeats a Contract ID across rows with different amounts                                                                                      |
| 3   | Re-import money compare uses cents, not the stored decimal string                                       | Drizzle `numeric` comes back as `"14.31"`; comparing that to `"14.31"` is fine, but mixed formats would false-update                                         |
| 4   | Import size cap is 10 MB                                                                                | The slim JSON of this dump is ~4.9 MB                                                                                                                        |
| 5   | Smoke auto-discovers `/finances/orders`; no hand-edited route list                                      | `scripts/smoke.mjs` walks `page.tsx` files                                                                                                                   |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1439-amazon-order-ingest/` with this plan, `shape.md`,
`standards.md`, `references.md`, and an empty `visuals/`.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.

## Task 2: Slim format + local preprocess script

Pure logic in `src/lib/amazon/`. CLI wrapper in `scripts/amazon-orders-slim.ts`.

## Task 3: Schema + migration

`amazon_orders`, `amazon_order_items`, refund/return/replacement tables. Generate +
read SQL + migrate. Commit `.sql` + snapshot + journal together.

## Task 4: Import + persistence

Detect slim JSON. Upsert Amazon-owned fields. Cross-user integration tests.

## Task 5: Settings import panel + API route

`POST /api/amazon/import` and a Settings panel. Not folded into `FinanceImportPanel`.

## Task 6: Finances Orders page

`/finances/orders` on the shared DataGrid. Register the page. Add to smoke.

## Task 7: Process the real dump and import it

Run the script on the supplied zip, import, re-import, spot-check.

## Task 8: Verify, freeze spec, update roadmap

Confirm acceptance criteria, freeze, update Financial planning, commit and push.
