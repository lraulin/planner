# References for Chase card statements + statement snapshots

## Governing specs

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. Same tables, sign rule, fingerprint + ordinal,
  insert-or-skip for transactions, last-four account identity.
- **Relevant decisions:** `csv:chase-credit` + filename last four is account identity;
  re-import never updates transactions; positive = money into the account.

### `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/`

- **Relationship:** Extends the PDF extract + mixed import path. **Supersedes** only
  the decision that every `.pdf` is a 360 statement.
- **Relevant decisions:** thin `unpdf` wrapper; fail closed on unknown PDFs; no real
  statements in the repo; opening + activity = closing is a warning not a failed batch;
  360 feed stays `csv:capitalone-bank`.

## Similar implementations

### Finance CSV parse + import

- **Location:** `src/lib/finances/{formats,import,fingerprint,money,types}.ts`
- **Relevance:** Statement rows must emit `ParsedAccount` / `ParsedTransaction` and go
  through the same persist path so they land on Chase `•••9910`. Cross-source skip is
  new because fingerprints include `postedDate` and statements do not have one.
- **Key patterns:** `parseAmountCents` accepts `$`, commas, and a leading `+`.
  Account naming `Chase •••9910`. `onConflictDoNothing` + `.returning()` counts.

### Capital One 360 statement parser

- **Location:** `src/lib/finances/statement.ts`
- **Relevance:** Same extract-then-parse split, period-year date resolution, reconcile
  warning. Chase is a different layout and lives in its own module.
- **Key patterns:** `looksLike…` detector; anonymized fixtures; skip informational
  rows; emit the existing parsed shape.

### Other multipart import routes

- **Location:** `src/app/api/finances/import/route.ts`
- **Relevance:** Size caps, one-bad-file-is-a-warning, `{ ok, created, skipped, warnings }`.
- **Key patterns:** Route reads the file; `src/lib` parses and writes.
