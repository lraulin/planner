# Amazon order ingest + Orders page — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Ingest Lee’s Amazon privacy-request dump as itemized receipts, and browse them on a
Finances Orders page. A local script strips the zip (mostly delivery JPEGs and invoice
PDFs) down to one slim JSON. The app imports that file. Digital content is included,
collapsed from Price/Tax component rows. Refunds, returns, and replacements come along
so cancelled spend is distinguishable later.

### Out of scope

- Matching orders to `finance_transactions` (date + last-4 + amount)
- Grocery-vs-discretionary / purpose tags
- Insights changes (Amazon stays Shopping on the register)
- Writing into `finance_transactions` or inventing spend
- Invoice PDFs, delivery photos, reviews, sustainability metrics
- Addresses, gift messages, tracking numbers
- Walmart or other receipt sources
- Envelopes

## Decisions

- Local preprocess via `unzip -p`, not a browser upload of the zip
- Slim JSON (`version: 1`, `source: "amazon-data-request"`) is the only ingest format
- Own tables; no `transaction_id` FK yet
- One grid row per line item; digital is a channel
- Store Amazon’s columns as given; do not reconstruct order totals
- SNS = shipping option `std-sns-us`
- Re-import upserts Amazon-owned fields (status changes; no user columns yet)
- Keep cancelled and refunded items
- Fixtures are synthetic; do not commit the dump

## Context

- **Visuals:** none
- **References:** see `references.md`
- **Product alignment:** roadmap § Financial planning, parked “itemized receipts”
  step. Source chosen: Amazon data request. Matching and purpose remain later.
- **Dump:** `/Users/leeraulin/Downloads/Your Orders.zip` plus
  `/Users/leeraulin/Downloads/FileDescriptions.csv` (Amazon’s official file list)

## Standards Applied

- database/migrations — new tables, generate + snapshot + journal
- development/testing — pure parse tests; integration with cross-user
- development/security — every mutation takes `userId`; no live PII in fixtures
- development/dates — Amazon instants → calendar `YYYY-MM-DD`, no `startOfDay`
- development/clean-code — logic in `src/lib/amazon/`; thin route and panel
- components/data-grid — Orders page rides the shared grid
- components/navigation — Finances page registry, not a new module
- api/response-format — `{ ok, data }` / `{ ok, error }`
- api/error-handling — stable codes, `safeErrorMessage`
