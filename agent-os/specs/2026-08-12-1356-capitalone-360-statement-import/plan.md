# Capital One 360 statement PDF import

**Status: frozen / complete** (2026-08-12)  
Spec folder: `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — same tables,
  sign rule (positive = money in), fingerprint + occurrence ordinal, insert-or-skip, last-four
  account identity, register UI unchanged.
- Does **not** supersede any CSV-import decision.

## Context

CSV exports only cover ~Aug 2024–present (checking/savings) or less (cards). The 37
`Statement_YYYY-MM.pdf` files in Dropbox `Finances/Transactions` are Capital One 360
**combined monthly bank statements**, from account opening (22 Jul 2023) through Jul 2026.

They contain checking `…2322`, savings `…2603`, and CD `…2957` (opened Jul 2023, closed out
to savings on 25 Jul 2024). They are **not** card statements. Chase / Capital One card PDF
layouts are a later spec.

This is historical backfill so later envelopes and spending patterns see the full 360
history. Roadmap § Financial planning is not a new item — envelopes stay next.

**Achieve had no finance module.** Nothing in `docs/achieve-planner/` governs this.

## Source format (from the real PDFs)

Text PDFs (not scans). `unpdf` extracts usable text. Layout is stable from Jul 2023 through
Jul 2026.

| Piece          | What it looks like                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| Period         | `STATEMENT PERIOD` / `Jul 22 - Jul 31, 2023` (first file is a partial month; later files are calendar months) |
| Account header | `360 Checking - 36237262322`, `360 Performance Savings - 36237262603`, `CD - 36237262957`                     |
| Columns        | `DATE DESCRIPTION CATEGORY AMOUNT BALANCE`                                                                    |
| Dates          | `Jul 8` — year comes from the period                                                                          |
| Amounts        | signed, `+ $2,311.22` / `- $693.37` — `parseAmountCents` already accepts `$`, commas, leading `+`             |
| Category       | `Credit` / `Debit` (direction, **not** a merchant category)                                                   |
| Bookends       | `Opening Balance` / `Closing Balance` — not transactions                                                      |
| Wraps          | description continues on the next line (`PENTAGON FEDERAL TRNSFR CR` + `000005440453016`)                     |
| Page breaks    | table continues; page header/footer and the column header reprint mid-stream                                  |
| Non-txns       | `Withdrawal for $1207.4 was Rejected` — no Credit/Debit, no amount, skip                                      |
| CD close       | 25 Jul 2024: `Interest Paid`, then `CD Close-Out to 360 Performance Savings …` to `$0.00`; gone from Aug 2024 |

Descriptions on overlapping months match the bank CSV **exactly**, so the existing
fingerprint will treat them as the same rows.

## Decisions

1. **This spec is only these 360 bank PDFs.** No Chase or Capital One card statements. No
   older `CapitalOne/*.csv` card-1797 files.
2. **No schema change.** `investment` and `closedAt` already exist. No migration.
3. **Share the existing feed `csv:capitalone-bank` and last-four keys** (`2322`, `2603`,
   `2957`). Checking and savings land on the accounts the CSV importer already created.
   Overlap is skipped by the existing unique index — the database stays the arbiter. A new
   `pdf:…` source would create a second pair of accounts and duplicate every overlapping
   row. The feed name is a slight lie; the economic events are the same as the bank CSV.
4. **CD `…2957` is a new account**, kind `investment`, name `CD •••2957`. On a close-out
   (a `CD Close-Out` row, or a CD section whose closing balance is `$0.00`), set `closedAt`
   to that date **only if it is currently null**. This is the one allowed account update;
   import still never updates transactions. Do not un-close.
5. **Statement `Credit`/`Debit` is sign, not `sourceCategory`.** Leave `sourceCategory` `""`
   the way the bank CSV does. `postedDate` is null. `balanceAfter` comes from the Balance
   column.
6. **Join wrapped description lines with a single space.** That is what the CSV contains
   and what the fingerprint needs.
7. **Skip opening/closing rows and rejected-withdrawal rows.** Warn on a rejected row rather
   than guessing an amount from the description.
8. **Reconcile each account section:** opening + sum(imported rows) = closing. Mismatch is a
   warning naming the file and account, not a failed batch.
9. **PDF text extraction is a thin I/O wrapper; the parser is pure.** Unit tests feed
   anonymized extracted-text fixtures, never real statements (PII: address, full account
   numbers). Do not copy the Dropbox PDFs into the repo.
10. **Same import panel and route.** Accept `.pdf` as well as `.csv`; mixed selections work.
    Bump `MAX_FILES` from 40 to 60 so the whole folder (37 PDFs + 4 CSVs) fits. Size caps
    stay (PDFs are 250–500 KB). Do not log extracted text.
11. **Add `unpdf` as a server-only dependency.** Already verified against these files.
    Extract with pages merged so a table that crosses a page is one stream; the parser
    skips reprinting headers/footers.

## Acceptance criteria

- [x] All 37 `Statement_*.pdf` files import in one multi-file upload (alone or mixed with CSVs)
- [x] Checking `2322` and savings `2603` are **not** duplicated — rows land on the existing accounts
- [x] Months that already exist from CSV are skipped; Jul 2023–early Aug 2024 (and any
      statement-only days) are created
- [x] After statements + the existing CSVs, checking and savings **sum-of-all-rows** match
      the latest CSV running balance (opening was $0.00 on 22 Jul 2023 — a missed or doubled
      row will show)
- [x] CD `2957` is created as `investment`, has its history including the 25 Jul 2024
      close-out, and `closedAt` is set
- [x] Re-importing the same PDFs creates 0 rows and skips all of them
- [x] Wrapped descriptions, page-broken tables, rejected withdrawals, and the first
      partial-month statement (22–31 Jul 2023) parse correctly
- [x] A statement section that does not reconcile warns; the rest of the batch still imports
- [x] User category/notes on overlapping CSV rows survive
- [x] Cross-user isolation: a second user cannot read the first user's new CD or rows

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure
code polish.

| #   | Change                                                                              | Why                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Detection accepts a statement that has only a CD or only savings, not just checking | The close-out month is a valid 360 statement even if a test fixture (or a future single-account extract) omits checking. Period + "bank statement" + any of the three account headers is enough. |

## Verified as built

- All 37 real statements imported against the existing CSV register: **created 317,
  skipped 516, 1 new account (the CD), 19 informational warnings** (rejected withdrawals
  and interest-rate changes). Checking and savings account count stayed 2.
- Checking balance **$471.45** and savings **$1,792.34** match the latest CSV running
  balances. Before the backfill those sums were wrong (history started mid-stream).
- CD `•••2957`: 14 rows, $0.00, `closedAt` 2024-07-25.
- Re-import of the 37 files: **created 0, skipped 833**.
- HTTP POST of a real PDF through `/api/finances/import`: created 0, skipped 44.
- Wrap row `Deposit from PENTAGON FEDERAL TRNSFR CR 000005440453016` is one description.
- Register and Settings → Import & export show the new copy and the five accounts.
- `npm test` 2,411 passing with no database-skip warning; lint, typecheck clean;
  `npm run smoke` renders all 26 routes.

## Follow-ups (new work — not amendments to this frozen spec)

- Chase / Capital One **card** statement PDFs (different layout).
- Hide closed accounts in the register picker.
- The older Capital One card-1797 CSVs in `Finances/CapitalOne/`.

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-12-1356-capitalone-360-statement-import/` with `plan.md`
(this plan, **Status: active**), `shape.md`, `standards.md` (full text of the five
standards), `references.md`. No `visuals/` — the Dropbox PDFs are the format reference and
must not be copied (PII).

## Task 2: Pure statement parser

`src/lib/finances/statement.ts` + `statement.test.ts`.

- Detect a Capital One 360 statement from extracted text (period + account header). Fail
  closed on some other PDF with a message that names the file and says only 360 monthly
  statements are supported.
- Parse period → resolve `Mon D` dates to `YYYY-MM-DD` without routing through `Date`
  local midnight.
- Split into account sections; last four digits are `externalKey`; kinds
  checking / savings / investment.
- Emit the existing `ParsedAccount` / `ParsedTransaction` shape so persist is unchanged.
- Fixtures: anonymized excerpts covering wrap, page-break reprints, rejected row, opening
  / closing, CD close-out, first partial month, multi-account. Assert reconcile on the
  fixtures.

## Task 3: PDF extract + mixed import

- Thin `extractPdfText(bytes)` around `unpdf`.
- Generalize the import entry point so a file is PDF-extracted then statement-parsed, or
  CSV-parsed, per file. Persist path stays `import.ts` (`csv:capitalone-bank`,
  `onConflictDoNothing`).
- When a CD section closes, set `closedAt` if null.
- Extend `import.integration.test.ts`: statement rows land on an existing 2322 account;
  CSV-then-PDF overlap skips; PDF-then-PDF skips; CD created and closed; second user
  cannot see the CD. No real PDFs in the repo — feed extracted-text (or a tiny synthetic
  PDF if extract itself needs a smoke test).

## Task 4: Route and import panel

- `src/app/api/finances/import/route.ts`: detect PDF by magic bytes / `.pdf`; read
  `arrayBuffer()` not `text()`; bump `MAX_FILES` to 60; do not log file contents.
- `FinanceImportPanel`: `accept` includes `.pdf`; copy mentions Capital One 360 monthly
  statements and that overlap with the bank CSV is skipped.

## Task 5: Import the real statements

Through the running app, upload the 37 Dropbox PDFs (and confirm a mixed re-import with
the four CSVs). Record created / skipped / warnings. Confirm:

- checking + savings account count stays 2 (plus the new CD)
- latest checking/savings balances match the latest CSV running balances
- re-import of the PDFs creates 0
- a known wrap row (`PENTAGON FEDERAL TRNSFR CR 00000…`) is one description, not two

Then `npm test` (watch for the DB-skip warning), lint, typecheck, `npm run smoke` against
the running server.

## Task 6: Verify, freeze spec, update roadmap

- Confirm acceptance criteria.
- Update plan/shape for any as-built drift; fill **Changes from original plan**.
- Mark **Status: frozen / complete** (date).
- Roadmap § Financial planning: note statement backfill is done; envelopes remain the
  outstanding MVP piece. Follow-ups (card statement PDFs, hide closed accounts) listed as
  new work, not amendments.

While this spec is **active**, when we make a material change to requirements, design,
or scope (including from feedback on what was implemented), update the relevant sections
and append to **Changes from original plan**. Skip pure implementation details. Freeze
when verified.
