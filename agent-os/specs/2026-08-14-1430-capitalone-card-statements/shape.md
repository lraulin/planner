# Capital One card statement PDF import — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Import the 67 Capital One VentureOne monthly statement PDFs onto the existing
`csv:capitalone-card` / `3448` account, write statement snapshots, and skip every row
the card CSV already stored.

### Out of scope

- Older Capital One card-1797 CSVs in `Finances/CapitalOne/`
- 2025 PDFs (not in the folder)
- Statements UI / reconciliation screen
- Updating an existing transaction when a statement arrives
- Envelopes, hide closed accounts, Plaid

## Decisions

- Delta on the frozen Chase statement spec. Same snapshot tables, same skip, same
  "filename last-four is identity because the printed PAN changed."
- Feed stays `csv:capitalone-card`. A new `pdf:…` source would create a second card
  and duplicate the CSV overlap.
- Flip signs. Normalize merchant text to the CSV form. Interest summary line becomes
  `INTEREST CHARGE:PURCHASES` so it collides with the CSV.
- Matching ignores case and extra spaces (Steam / AGENT FEE). Still does **not**
  match on date+amount alone — Disney Plus and Kindle Unltd can share a day and a
  $12.71.
- Empty first cycle (Aug 2019, $0) still writes a snapshot.

## Context

- **Visuals:** None. Real PDFs stay in Dropbox (PII: name, address, full account #).
- **References:** Chase card statement parser is the template; 360 bank PDFs are a
  different layout.
- **Product alignment:** Roadmap § Financial planning. Fills the pre-2025-08 card
  itemization gap the insights spec called out. Envelopes still next.

## Standards Applied

- development/testing — pure parser tests + import integration with skip / isolation
- development/dates — ledger dates are calendar days, string-to-string, never `Date`
  local midnight
- development/clean-code — parser in `src/lib/finances/`, persist path unchanged
- development/security — no PII in the repo; do not log extracted text
- api/response-format — existing import envelope, extra warning copy only
- development/commits — one logical change; spec trailer
