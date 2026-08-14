# Capital One card statement PDF import

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1430-capitalone-card-statements/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — same tables,
  sign rule (positive = money in), fingerprint + occurrence ordinal, insert-or-skip,
  last-four account identity, register UI unchanged.
- **Extends:** `agent-os/specs/2026-08-12-1540-chase-statement-import/` — same PDF extract
  (`unpdf`, merged pages), mixed CSV+PDF upload, fail-closed unknown PDFs, statement
  snapshots, cross-source skip (date + signed amount + description), no real statements
  in the repo.
- **Supersedes:** `2026-08-12-1540` decision that Capital One card PDFs are out of scope,
  and the supported-PDF list that named only Chase Prime Visa and Capital One 360.
  Does **not** supersede Chase or 360 parse rules, feeds, or snapshot schema.

## Context

67 VentureOne monthly PDFs in Dropbox `Finances/CapitalOne/CC Statements`
(`Statement_MMYYYY_3448.pdf`, Aug 2019 – Jul 2026, with 2025 missing). The existing
Capital One card CSV (`csv:capitalone-card` / `3448`) already covers 10 Aug 2025 –
10 Aug 2026 (790 rows). Statements are the official monthly record and the only
itemization before that CSV window. Insights currently sees pre-2025-08 card spending
only as lump payments from checking.

Roadmap § Financial planning — not a new item. Envelopes stay next.

**Achieve had no finance module.** Nothing in `docs/achieve-planner/` governs this.

## Source format (from the real PDFs)

Text PDFs. `unpdf` extracts usable text. Two ledger layouts and a reissued PAN:

| Piece           | What it looks like                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity        | Filename `Statement_MMYYYY_3448.pdf`. Printed last-four is `1750` (2019), `1797` (2020–mid-2024), then `3448`. **Filename wins.**                             |
| Period          | `Dec 22, 2025 - Jan 21, 2026 \| 31 days in Billing Cycle` (optional `Aug.` dots on early files)                                                               |
| Summary         | `Previous Balance`, `Payments`, `Other Credits`, `Transactions`, `Cash Advances`, `Fees Charged`, `Interest Charged`, `New Balance =`                         |
| Due / limit     | `Payment Due Date` + `Feb 15, 2026`; `Minimum Payment Due`; `Credit Limit`; `Available Credit (as of …)`                                                      |
| Early ledger    | `Date Description Amount` / `Jan 16 AMZN Mktp` + wrap `US*…Amzn.com/billWA` + `$25.16` on its own line                                                        |
| Later ledger    | `Trans Date Post Date Description Amount` / `Jul 1 Jul 2 SBARRO WASHINGTON DC $6.59`                                                                          |
| Payments        | `CAPITAL ONE MOBILE PYMTAuthDate 20-Jun - $558.38` or (2026) `CAPITAL ONE MOBILE PYMT - $633.94`. Refunds are also `- $`.                                     |
| Skip            | Page headers, `PSGR:` / `ORIG:` airline wraps, `Additional Information`, original-currency + `Exchange Rate` lines, period totals                             |
| Interest        | `Interest Charge on Purchases $79.23` is **not** in the purchase list. CSV name is `INTEREST CHARGE:PURCHASES` on the closing date.                           |
| Overlap wording | CSV is the short merchant (`SBARRO`, `PIZZA HUT 036874`, `METLIFE PET`). The PDF mashes city, state, phone, URL, `Amzn.com/bill`. Must strip to the CSV form. |

Dates on the ledger are `Mon D`; year comes from the opening/closing period (Dec–Jan wrap).

## Decisions

1. **This spec is Capital One VentureOne / Visa Platinum / Visa Signature monthly PDFs.**
   No older card-1797 CSVs. No envelopes. No statements page.
2. **Account identity is filename `3448` + feed `csv:capitalone-card`.** Lands on the
   existing card. Printed last-four is display-only and must not create `1750` or `1797`
   accounts. A file with no `Statement_…_NNNN` (or `capital one`+NNNN) fails with the
   same kind of message the Chase path already uses.
3. **Flip statement amounts** onto the module sign. After the flip, a purchase is
   negative and a payment/refund is positive — matching the card CSV.
4. **Normalize merchant text at parse time** so it matches the CSV: drop `AuthDate…`,
   hyphenated phones, `Amzn.com/bill`, URLs, trailing US state / `WASHINGTON DC`, a
   trailing domain that is not the whole description, and trailing location words that
   are not part of the merchant. Do not strip store numbers or `CVSExtraCare 8007467287RI`.
   First source to land wins the wording; import still never updates a transaction.
5. **Cross-source skip is the existing date + signed amount + description matcher**,
   occurrence-counted. Matching is case-insensitive and collapses interior whitespace
   so `WL *Steam Purchase` / `WL *STEAM PURCHASE` and `AGENT FEE   890…` do not
   duplicate. Same-file re-import still relies on the fingerprint unique index.
6. **Emit `INTEREST CHARGE:PURCHASES` on the period-end date** when
   `Interest Charge on Purchases` is non-zero, so it skips the CSV row and
   opening + activity = closing.
7. **Insert-or-skip statements** on the existing unique key. Same snapshot columns as
   Chase (due, limit, available credit, activity totals, YTD, rewards, APR rows when
   readable).
8. **PDF dispatch** is Chase vs 360 vs Capital One card vs unknown. An unknown PDF
   names the file and lists all three supported formats.
9. **Pure parser + anonymized fixtures.** Never copy Dropbox PDFs into the repo.
10. **No delete of existing CSV rows.** Cross-source skip backfills Aug 2019–Jul 2025
    (and any statement-only rows) and writes 67 snapshots. 2025 PDFs are not in the
    folder; that year stays CSV-only.

## Acceptance criteria

- [x] All 67 `Statement_*_3448.pdf` files import in one multi-file upload (alone or
      mixed with CSVs / other statements)
- [x] They land on the existing Capital One `•••3448` account — account count for that
      feed/key stays 1; no `1750` or `1797` account
- [x] Months already in the CSV are skipped as transactions; pre-CSV history is created
- [x] Re-importing the same PDFs creates 0 transactions and 0 new statements
- [x] CSV after statements (or statements after CSV) does not duplicate overlap
- [x] User category/notes on overlapping CSV rows survive
- [x] Each unique billing cycle writes one `finance_statements` row with period,
      opening/closing (module sign), due date, min pay, credit limit, and activity
      totals when printed
- [x] Both ledger layouts, wrapped Amazon lines, AuthDate payments, Dec–Jan wrap,
      foreign-currency extras, airline wraps, and `INTEREST CHARGE:PURCHASES` parse
- [x] Unknown PDFs fail that file with a supported-formats message that names the
      Capital One card format
- [x] Cross-user isolation still holds (existing statement isolation tests remain)
- [x] Register UI unchanged aside from import-panel copy

## Verified as built

- 67 real PDFs against the existing CSV register: **created 3,614, skipped 646,
  0 new accounts, 65 statement snapshots, 0 warnings.** Card account count stayed 1
  (`•••3448`). Transactions 790 → 4,404. Earliest row 2020-02-01 (the Aug 2019 file
  is a $0 first cycle). No `1750` or `1797` account.
- Two files in the folder are duplicates of the previous month (`Statement_082023`
  reprints Jun 21–Jul 21; `Statement_102023` reprints Aug 22–Sep 20). Unique
  snapshot key skipped those two. `Statement_112023` is the Sep 21–Oct 21 cycle
  under a November filename. The folder has no 2025 PDFs, so Aug 2024–Aug 2025
  itemization is still CSV-only from 2025-08-10.
- Re-import of the 67 files: **created 0, skipped 4,260, statements skipped 67.**
- All 458 rows on the 2026 statements matched a CSV row (date + amount + folded
  description, including mashed city/phone leftovers).
- `npm test` on the finance suites passed with no database-skip warning; lint and
  typecheck clean.

## Follow-ups (new work — not amendments to this frozen spec)

- 2025 Capital One card PDFs, if they turn up.
- Older card-1797 CSVs in `Finances/CapitalOne/`.
- Statements UI / reconciliation screen.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                                                      | Why                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cross-source match folds case/whitespace and treats a leftover city, domain, or id suffix as the same event | PDF text mashes `WAWA 592CALIFORNIAMD` and `PAYPAL *PADDLE.NET35314369001`; exact description equality would have duplicated all 75 of those overlap rows. |
| 2   | 65 snapshots from 67 files                                                                                  | Two PDFs in the Dropbox folder are the previous month reprinted under the next filename. The unique `(account, period)` key is the right skip.             |
| 3   | Later-layout rows keep `postedDate` when the PDF prints it                                                  | The 2022+ ledger has trans + post dates that match the CSV. Fingerprint uniqueness still includes it; skip does not depend on it.                          |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1430-capitalone-card-statements/` with `plan.md`
(this plan, **Status: active**), `shape.md`, `standards.md`, `references.md`. No
`visuals/` — the Dropbox PDFs are the format reference and must not be copied (PII).

## Task 2: Capital One card parser (pure)

`src/lib/finances/capitalOneCardStatement.ts` + `capitalOneCardStatement.test.ts`.
Detect, parse both layouts, flip, normalize, emit `INTEREST CHARGE:PURCHASES`, emit
`ParsedAccount` + `ParsedStatement`. Anonymized fixtures. Filename last-four, not
printed PAN.

## Task 3: Dispatch, matching, persist path

`parseImportFile` dispatches card PDFs. Shared supported-formats string. Cross-source
skip is case-insensitive and whitespace-collapsed. Integration tests: land on 3448,
CSV↔statement skip both directions, re-import, category survives.

## Task 4: Route and import panel copy

Name Capital One card monthly statements. Caps stay 80 files / 40 MB (67 PDFs fit).

## Task 5: Import the real statements

Upload the 67 PDFs against the existing register. Record created / skipped /
snapshots. Re-import must create 0. Confirm account count stays 1.

## Task 6: Verify, freeze spec, update roadmap

Confirm acceptance criteria. Mark **Status: frozen / complete**. Note the card
backfill on the roadmap; envelopes remain outstanding.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant
sections and append to **Changes from original plan**. Skip pure implementation
details. Freeze when verified.
