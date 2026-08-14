# References for Capital One card statement PDF import

## Governing specs

### `agent-os/specs/2026-08-12-1540-chase-statement-import/`

- **Relationship:** Extends. This is the same job for the other card. Supersedes only
  "no Capital One card PDFs" and the two-format supported-PDF list.
- **Relevant decisions:** filename last-four over printed PAN; flip signs; normalize
  merchant text; cross-source skip; snapshot tables; fail-closed dispatch; no real
  PDFs in the repo.

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends. Card rows stay on `csv:capitalone-card` / `3448`.
- **Relevant decisions:** positive = money in; insert-or-skip; occurrence ordinal
  (the SBARRO pair appears on the Jul 2026 statement too).

### `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/`

- **Relationship:** Extends extract + mixed import. Does not change 360 parse.
- **Relevant decisions:** thin `unpdf` wrapper; 360 detection must stay tighter than
  "mentions capitalone.com".

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Not extended. Context only — insights currently treats pre-2025-08
  Capital One card spend as lump checking payments. This backfill itemizes that
  history. Classification stays a later pass.

## Similar implementations

### Chase card statement parser

- **Location:** `src/lib/finances/chaseStatement.ts`
- **Relevance:** Closest sibling. Same emit shape, same filename-key rule, same
  reconcile warning.
- **Key patterns:** `looksLike…` + `parse…`; anonymized fixture builder; flip helper;
  merchant normalizer exported for its own tests.

### Cross-source skip

- **Location:** `src/lib/finances/matchExisting.ts`
- **Relevance:** The guard against CSV/statement duplicates. This spec only loosens
  the key for case and whitespace, not for "same day, same cents."

### Capital One card CSV

- **Location:** `src/lib/finances/formats.ts` (`parseCapitalOneCardRow`)
- **Relevance:** Target wording and sign. Debit → negative, Credit → positive.
  `Card No.` is already `3448`.
