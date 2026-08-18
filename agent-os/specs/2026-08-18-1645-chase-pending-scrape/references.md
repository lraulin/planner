# References for Chase pending scrape

## Governing specs

### `agent-os/specs/2026-08-16-1556-capitalone-pending-scrape/`

- **Relationship:** Extends the paste protocol; supersedes "Chase pending stays SimpleFIN-only"
- **Relevant decisions:** D1 TSV, D2 snapshot replace, D4 last-4, D7 dashboard paste

### `agent-os/specs/2026-08-15-1315-live-bank-sync/`

- **Relationship:** Extends D5c (no forced refresh)
- **Relevant decisions:** SimpleFIN updates about daily; Refresh Now re-reads the cache

## Similar implementations

### Capital One userscript

- **Location:** `scripts/capitalone-pending.user.js`
- **Relevance:** Same mount/copy/clipboard shape
- **Key patterns:** Thin DOM extractor; parser lives in `capitalOnePending.ts`
