# References for Amazon order ingest

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends
- **Relevant decisions:** `numeric(14,2)`, DataGrid, `(externalSource, externalId)`,
  per-user isolation, do not invent spend. Insert-or-skip is **not** copied: Amazon
  dumps are snapshots whose status changes.

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends the parked follow-up, not the dashboard itself
- **Relevant decisions:** attach line items later without changing `amount`; Amazon
  is Shopping by merchant until purpose exists

### `agent-os/specs/2026-08-13-0747-module-pages/`

- **Relationship:** Extends
- **Relevant decisions:** Finances pages live in `pages.ts`; Insights is already
  `built`; Orders is a third page, not a setting

## Similar implementations

### Finance CSV import

- **Location:** `src/lib/finances/{formats,import,fingerprint,money}.ts`
- **Relevance:** parse / persist split, money helpers, provenance index
- **Key patterns:** `parseCsvRows`, chunked insert, `onConflictDoNothing` (we upsert
  instead)

### Tomboy / RedNotebook / finance import routes

- **Location:** `src/app/api/{tomboy,rednotebook,finances}/import/route.ts`
- **Relevance:** multipart, size caps, envelope, Settings panel chrome
- **Key patterns:** `readJsonResponse`, result created/skipped line

### Register grid

- **Location:** `src/components/finances/{FinancesView,financeColumns}.tsx`
- **Relevance:** flat module on DataGrid, money column formatting
- **Key patterns:** `formatUsd`, `useGridState`, catalog create → import

### Module pages

- **Location:** `src/lib/navigation/pages.ts`
- **Relevance:** add `orders` next to `register` and `insights`

## Dump files (not in repo)

Amazon’s `FileDescriptions.csv` names the CSVs. The zip lives at
`/Users/leeraulin/Downloads/Your Orders.zip`. Do not commit it.

Kept by the slim script:

- `Your Amazon Orders/Order History.csv`
- `Your Amazon Orders/Digital Content Orders.csv`
- `Your Amazon Orders/Digital Returns.csv`
- `Your Returns & Refunds/Refund Details.csv`
- `Your Returns & Refunds/Returns Status.csv`
- `Your Returns & Refunds/Replacement Orders.csv`

Dropped: delivery JPEGs, invoice PDFs, reviews, sustainability, photos metadata.
