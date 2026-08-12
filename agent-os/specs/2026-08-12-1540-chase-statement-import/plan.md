# Chase card statements + statement snapshots

**Status: active**  
Spec folder: `agent-os/specs/2026-08-12-1540-chase-statement-import/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — same tables
  and sign rule (positive = money in), fingerprint + occurrence ordinal, insert-or-skip for
  transactions, last-four account identity, register UI unchanged.
- **Extends:** `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` — same PDF
  extract (`unpdf`, merged pages), mixed CSV+PDF upload, fail-closed unknown PDFs, no real
  statements in the repo.
- **Supersedes:** `2026-08-12-1356` decision that every `.pdf` is a 360 statement. Dispatch
  by detected format. Chase Prime Visa monthly statements are now a second PDF format.
  Does **not** supersede 360 parse rules, feed sharing, or CD close-out.

## Context

31 Chase Prime Visa PDFs in Dropbox `Finances/Chase/`
(`YYYYMMDD-statements-9910-.pdf`, billing cycles 19 Dec 2023 – 18 Jul 2026). The existing
Chase CSV (`csv:chase-credit` / `9910`) already covers 12 Aug 2024 – 10 Aug 2026
(722 rows). Statements are the official monthly record (closing balance, due date, credit
line, APR, rewards). CSV remains the way to get the current incomplete cycle.

Roadmap § Financial planning — not a new item. Envelopes stay next.

**Achieve had no finance module.** Nothing in `docs/achieve-planner/` governs this.

## Source format (from the real PDFs)

Text PDFs. `unpdf` extracts usable text. Layout is stable 2024–2026 with two wrinkles:
the printed PAN last-four changes, and later files add a Shop-with-Points restatement.

| Piece               | What it looks like                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity            | Filename `…statements-9910-.pdf`. Printed account is `4147 4004 1523 4903` (early 2024), then `XXXX XXXX XXXX 8570`, then `XXXX XXXX XXXX 9910`. **Filename wins.** |
| Period              | `Opening/Closing Date 12/19/23 - 01/18/24`                                                                                                                          |
| Statement date      | `Statement Date: 01/18/24`                                                                                                                                          |
| New / previous      | `New Balance $943.40`, `Previous Balance $0.00`                                                                                                                     |
| Due                 | `Payment Due Date: 02/15/24`, `Minimum Payment Due: $35.00`, `Past Due Amount $0.00`                                                                                |
| Credit              | `Credit Access Line $6,000` (not "Credit Limit"), `Available Credit $5,056`                                                                                         |
| Activity totals     | `Payment, Credits -$7,217.70`, `Purchases +$8,161.10`, cash/transfers/fees/interest                                                                                 |
| Ledger              | `01/02 Payment Thank You-Mobile -1,207.40` — **statement sign is inverted** vs the CSV (purchases positive)                                                         |
| Wraps               | `Order Number 112-…` on the next line — **not** part of the description (CSV has no order #)                                                                        |
| Fees / interest     | `12/15 LATE FEE 28.00`, `12/18 PURCHASE INTEREST CHARGE 14.58` — real rows                                                                                          |
| Skip                | `TOTAL FEES FOR THIS PERIOD`, page headers, `Date of Transaction` reprints                                                                                          |
| Rewards restatement | `Split Transaction` / `SHOP WITH POINTS ACTIVITY` rows with a points column (`4.23 423`) — **not** charges                                                          |
| YTD                 | `Total fees charged in 2024 $28.00`                                                                                                                                 |
| Points              | `YOUR PRIME VISA POINTS` / `Total points available for redemption 4,154`                                                                                            |
| APR                 | `Purchases 23.24%(v)(d) - 0 - - 0 -`; a cycle can have two purchase rows (`Purchases prior to 07/09/2025` + `Purchases`)                                            |

Dates on the ledger are `MM/DD`; year comes from the opening/closing period (Dec–Jan wrap).

## Decisions

1. **This spec is Chase Prime Visa monthly PDFs + a statement-snapshot store.** No Capital
   One card PDFs. No envelopes. No hide-closed-accounts. No statements page — persist only,
   import summary reports snapshot counts.
2. **Account identity is filename `9910` + feed `csv:chase-credit`.** Lands on the existing
   Chase card. Printed PAN last-four is display-only and must not create 4903 / 8570
   accounts. A file with no `statements-NNNN` (or `chase`+NNNN) fails with the same kind of
   message the CSV path already uses.
3. **Flip statement amounts** onto the module sign (positive = money into the account).
   After the flip, a purchase is negative and a payment is positive — matching the CSV.
4. **Normalize merchant text at parse time** so it matches the CSV: drop
   `Amzn.com/bill` / `amzn.com/bill` / `AMZN.COM/BILL`, phone numbers, trailing 2-letter
   state, and never append `Order Number` wraps. Stored description is the normalized form.
   First source to land wins the wording; import still never updates a transaction.
5. **Cross-source skip (posted date ignored).** Fingerprints still include `postedDate`, so
   a statement row (no post date) will not collide with a CSV row in the unique index.
   Before insert, skip a row when that account already has the same
   `transactionDate + signed amount + description`, occurrence-counted. Applies to **every
   feed**, so CSV-then-statement and statement-then-CSV both work. Same-file re-import
   still relies on the fingerprint unique index.
6. **Skip Shop-with-Points / rewards restatement rows** (extra integer points column).
   Import LATE FEE and PURCHASE INTEREST CHARGE. Skip period-total summary lines.
7. **New tables, not columns on transactions.**
   - `finance_statements` — one row per account per billing period.
   - `finance_statement_rates` — 0–N APR rows (cards only; a cycle can have two purchase
     rates).
8. **Money on a statement:**
   - `openingBalance`, `closingBalance`, and the activity totals (`paymentsCredits`,
     `purchases`, `cashAdvances`, `balanceTransfers`, `feesCharged`, `interestCharged`)
     use the **module sign**. Card new-balance $239.34 is stored as `-239.34`. Then
     `opening + sum(imported rows) = closing` is the same check for bank and card.
   - `minimumPayment`, `pastDueAmount`, `creditLimit`, `availableCredit`, `ytdFees`,
     `ytdInterest` are **magnitudes as printed** (non-negative facts, not ledger direction).
   - `rewardsPoints` is an integer.
9. **360 statements emit snapshots too.** Opening/closing (already parsed) become
   `finance_statements` rows; card columns and rates stay null/empty. Re-importing the
   37 360 PDFs fills snapshots and creates 0 transactions. Does not change 360 transaction
   parse.
10. **Insert-or-skip statements.** Unique on `(userId, accountId, periodStart, periodEnd)`.
    No user-editable statement fields this spec, so skip is enough. Do not update.
11. **PDF dispatch is fail-closed.** Chase vs 360 vs unknown. An unknown PDF names the
    file and lists the supported formats. Detection must not send a Chase file through
    the 360 parser.
12. **Pure parser + anonymized fixtures.** Never copy Dropbox PDFs into the repo (PII:
    name, address, full PAN).
13. **Bump upload caps** so 31 Chase + 37 360 + the CSVs fit: `MAX_FILES` 80,
    `MAX_TOTAL_BYTES` 40 MB. Size per file stays 5 MB.
14. **No delete of existing CSV rows.** Cross-source skip backfills Dec 2023–early Aug
    2024 and writes 31 snapshots. Optional later: user deletes Chase rows if they want
    statement wording to win.

## Acceptance criteria

- [ ] All 31 Chase `*-statements-9910-.pdf` files import in one multi-file upload (alone
      or mixed with CSVs / 360 PDFs)
- [ ] They land on the existing Chase `•••9910` account — account count for that feed/key
      stays 1; no `4903` or `8570` account
- [ ] Months already in the CSV are skipped as transactions; Dec 2023–early Aug 2024 (and
      any statement-only rows) are created
- [ ] Re-importing the same PDFs creates 0 transactions and 0 new statements
- [ ] CSV after statements (or statements after CSV) does not duplicate overlap
- [ ] User category/notes on overlapping CSV rows survive
- [ ] Each Chase file writes one `finance_statements` row with period, opening/closing
      (module sign), due date, min pay, credit line, available credit, activity totals,
      YTD fees/interest, rewards points, and APR rate rows
- [ ] Re-importing the 37 360 PDFs creates statement snapshots for checking/savings/CD
      and 0 transactions
- [ ] A statement whose opening + activity ≠ closing warns (file + account); the rest of
      the batch still imports
- [ ] Wrapped order numbers, page-break reprints, Shop-with-Points rows, LATE FEE /
      interest, and the Dec–Jan year wrap parse correctly
- [ ] Unknown PDFs fail that file with a supported-formats message
- [ ] Cross-user isolation: a second user cannot read the first user's statements or rates
- [ ] Register UI unchanged aside from import-panel copy and summary counts

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-12-1540-chase-statement-import/` with `plan.md` (this
plan, **Status: active**), `shape.md`, `standards.md` (full text of the six standards),
`references.md`. No `visuals/` — the Dropbox PDFs are the format reference and must not
be copied (PII).

## Task 2: Schema + migration

`finance_statements` and `finance_statement_rates` in `src/db/schema.ts`. Generate,
read, migrate. Commit `.sql` + snapshot + journal together. Register in
`crossUserReads.integration.test.ts`.

## Task 3: Chase parser (pure)

`src/lib/finances/chaseStatement.ts` + `chaseStatement.test.ts`. Detect, parse, flip,
normalize, emit `ParsedAccount` + `ParsedStatement`. Anonymized fixtures.

## Task 4: 360 parser emits snapshots + PDF dispatch

360 opening/closing become snapshots. `parseImportFile` dispatches Chase / 360 /
unknown. CSVs unchanged aside from an empty `statements` array.

## Task 5: Persist snapshots + cross-source skip

Insert-or-skip statements. Skip transactions already present by
date + amount + description (occurrence-counted). Integration tests including
two-user isolation.

## Task 6: Route and import panel

Return snapshot counts. Bump `MAX_FILES` to 80 and `MAX_TOTAL_BYTES` to 40 MB.
Update copy.

## Task 7: Import the real statements

Upload the 31 Chase PDFs through the running app; then re-import the 37 360 PDFs.
Record counts. `npm test`, lint, typecheck, `npm run smoke`.

## Task 8: Verify, freeze spec, update roadmap

Confirm acceptance criteria. Mark **Status: frozen / complete**. Note Chase
backfill + snapshot store on the roadmap; envelopes remain outstanding.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
