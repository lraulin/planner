# References for External-transfer provenance

## Governing specs

### `agent-os/specs/2026-08-14-1617-statement-cash-flow/`

- **Relationship:** Extends; supersedes its claim that a residual is "a hole or a
  classification miss"
- **Relevant decisions:** both series on one y-axis; compute over full history then slice;
  the discrepancy is the diagnostic; do not rewrite `amount`
- **What changes:** a residual is now understood to have a third, legitimate source — an
  external transfer — and the identity is stated rather than assumed to be zero

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends; supersedes decision 1 **only** for PayPal and Coinbase
- **Relevant decisions:** transfers paired via `transfer_group_id` rather than a description
  regex; unpaired legs still classify; coverage gap counts only unpaired legs
- **What carries forward:** PenFed stays `external_transfer`. Its rationale — that calling
  an unimported bank's sweeps income would invent earnings — is untouched, because PenFed is
  still unimported

### `agent-os/specs/2026-08-12-1048-finances-csv-import-register/`

- **Relationship:** Extends
- **Relevant decisions:** import inserts or skips and never updates; the database decides
  duplicates via the partial unique index on `(user_id, external_source, external_id)`;
  account identity is `(externalSource, externalKey)`, never the name

### `agent-os/specs/2026-08-14-1208-finance-agent-tools/`

- **Relationship:** Extends
- **Relevant decisions:** agent numbers = page numbers; integer cents; extend `get_cash_flow`
  rather than add a tool

## Similar implementations

### Statement parsers

- **Location:** `src/lib/finances/chaseStatement.ts`, `capitalOneCardStatement.ts`,
  `statement.ts`
- **Relevance:** the `looksLikeX` / `parseX` pair the PayPal parser should follow
- **Key patterns:** parse extracted text, not the PDF; skip reprinted page headers; fixtures
  are real extracted strings

### `matchExisting.ts`

- **Location:** `src/lib/finances/matchExisting.ts`
- **Relevance:** the occurrence-counted matching the PayPal resolver mirrors
- **Caveat:** `descriptionsMatch` does **not** apply here — PayPal names the merchant where
  the bank names only the rail, so the resolver matches on date + signed amount and must
  keep the occurrence ordinal to stay safe

### `classify/transfers.ts`

- **Location:** `src/lib/finances/classify/transfers.ts`
- **Relevance:** where `EXTERNAL_PATTERNS` currently sends PayPal and PenFed; the 5-day
  `PAIR_WINDOW_DAYS` and the "at least one leg must carry intent" rule are the guards to
  reuse when pairing Coinbase withdrawals to their checking legs
- **Key line:** the module comment at 63-72 states the reasoning this spec conditionally
  supersedes; update it rather than deleting it, so the history of the decision survives

### `classify/rules.ts` and `classify/merchant.ts`

- **Location:** `src/lib/finances/classify/rules.ts`, `merchant.ts`
- **Relevance:** `CLASSIFY_RULES` already supports `flow`, `category`, and a canonical
  `merchant`, which is the whole mechanism the PayPal enrichment needs
- **Key patterns:** rules match the **normalized** merchant; `merchant.ts:42-53` already
  strips the `PAYPAL *` and `PP*` processor stamps, so new rules match the residue
  (`SPOTIFY*<hash>`, `PADDLE.NET<digits>`)

### `classify/reclassify.ts`

- **Location:** `src/lib/finances/classify/reclassify.ts:165-185`
- **Relevance:** the `external_transfer` default for an unclaimed credit is the exact line
  the resolutions must take priority over

### `analytics.ts` / `insightsAnalysis.ts`

- **Location:** `src/lib/finances/analytics.ts:138-151`, `insightsAnalysis.ts:134-155`
- **Relevance:** `incomeCentsOf` / `spendCentsOf` are where `external_transfer` currently
  falls through both branches; the statement zip is where the residual belongs
