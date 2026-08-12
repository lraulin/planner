# References for Capital One 360 statement PDF import

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. Same tables, sign rule, fingerprint + ordinal, insert-or-skip,
  last-four account identity. This spec adds a second _input_ for the same Capital One 360
  bank feed; it does not change how those rows are stored.
- **Relevant decisions:** `csv:capitalone-bank` + last four is account identity; re-import
  never updates transactions; Credit/Debit on the bank feed is direction, not a category.

## Similar implementations

### Finance CSV parse + import

- **Location:** `src/lib/finances/{formats,import,fingerprint,money,types}.ts`
- **Relevance:** Statement rows must emit `ParsedAccount` / `ParsedTransaction` and go
  through the same persist path so fingerprints collide with the existing CSV rows.
- **Key patterns:** `parseAmountCents` already accepts `$`, commas, and a leading `+`.
  Account naming `360 Checking •••2322`. `onConflictDoNothing` + `.returning()` counts.

### Other multipart import routes

- **Location:** `src/app/api/finances/import/route.ts`, `src/app/api/rednotebook/import/route.ts`
- **Relevance:** Size caps, one-bad-file-is-a-warning, `{ ok, created, skipped, warnings }`.
- **Key patterns:** Route reads the file; `src/lib` parses and writes. PDFs need
  `arrayBuffer()` instead of `text()`.
