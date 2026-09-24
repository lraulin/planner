# One history source per account

**Status: active**  
Spec folder: `agent-os/specs/2026-09-23-1316-one-history-source-per-account/`

## Spec relationships

- **Supersedes:** `2026-09-14-1004-ledger-ready-to-assign` **D4**, but only in how an account
  counts as feed-covered: it was "has a SimpleFIN link", and becomes the account's stored history
  source (D1 here). D4's rule itself carries forward: a page never writes posted history for a
  SimpleFIN-sourced account.
- **Supersedes:** `2026-09-20-1216-holds-are-never-deleted-by-absence` **D2**, for page-sourced
  accounts only: a closed statement's rows (`recentPosted`) become history instead of evidence. For
  every other account they stay evidence only.
- **Supersedes:** `2026-09-01-1205-source-as-of-authority` **D1**, only where the derived headline
  cache lives: it moves from `bank_account_links` to `finance_accounts`. The authority rule and its
  single writer are unchanged.
- **Extends:** `2026-08-29-0845-bank-snapshots-finance-audit` (capture format, audit),
  `2026-08-15-1315-live-bank-sync` (links, sync), `2026-09-13-1127-ingest-by-identity` (pairing,
  retirement), `2026-08-12-1048-finances-csv-import-register` / `2026-08-14-1430-capitalone-card-statements`
  (file imports).

## Context

Nearly every ingestion bug since Aug 15 (about 240 commits) came from one card's charges arriving
from two or three sources with different wording, then being matched up by guesswork. The bank
page shows cleaned display names ("YouTube", "Pizza Hut") and never the raw text SimpleFIN or a CSV
sends ("PIZZA HUT 036874"). Three cases from 2026-09-23 alone:

- **Starbucks:** a CSV row sat beside a SimpleFIN row because SimpleFIN masked the store digits.
- **Kim's Nails III:** a $50 page hold sat beside a $60 SimpleFIN posting because of the tip.
- **YouTube:** a charge posted Sep 22 was on the page but missing from the register while
  SimpleFIN lagged.

On top of that, SimpleFIN reports Capital One's posting day as the purchase day.

Lee's decision (2026-09-23): **Chase •••9910 is SimpleFIN only. Capital One •••3448 is bank-page
only; he pastes from the page every time he opens the app. 360 Checking and Savings stay on
SimpleFIN.** Better matching cannot solve this problem; only one source per account removes it.

## Decisions

### D1: Each account stores its history source

New `finance_accounts.history_source` (`simplefin` | `bank_page` | `files`) with
`history_source_since date`. It replaces the implicit "has a SimpleFIN link" test at
`bankSnapshotApply.ts:440-457`, so `feedCovered` becomes `history_source !== 'bank_page'`. A paste
is accepted only when the account's source is `bank_page`; otherwise it refuses with a message
naming the source. That includes Chase: the Chase paste path stops writing anything, and
`scripts/chase-pending.user.js` is removed (Lee uninstalls it from Tampermonkey). A sync skips
accounts whose source is not `simplefin`, even if a link remains.

### D2: The headline balance belongs to the account, not the SimpleFIN link

The derived headline cache (`balance_cents`, `available_cents`, `balance_as_of`,
`balance_source`) moves from `bank_account_links` to `finance_accounts`, written only by
`recomputeAccountBalanceAuthority` (`sourceStateWrite.ts`). Source state is already keyed by
account. Today's placement is why a paste throws "has no bank balance link" without SimpleFIN.
Readers to move: `finances/queries.ts:187-208`, `import.ts:204-221`, `banksync/queries.ts`,
`sourceStateWrite.ts`.

### D3: Page-sourced posted history, with purchase and posted dates

For a `bank_page` account the existing pre-D4 path authors posted rows (`postedInserts`,
`postedTransitions`). A hold that posts is transitioned in place. It keeps its purchase date as
`transaction_date` plus its envelope, notes and flow, and gains `posted_date`. That is also how a
tipped hold like Kim's Nails resolves: same page and name, same purchase day, new amount
(`sameDateAndDescription`, already covered by the Sheetz tip test). Rows posted on or before
`history_source_since` are never inserted (D5).

### D4: Rows carry the statement descriptor; the display name is kept

The userscript already opens every row. It also captures "Appears on statement as: …" as an
optional row field. **`description` = the statement descriptor** (the CSV/PDF wording, which payee
normalization already handles), and the display name goes to a new nullable
`finance_transactions.bank_display_name`. Pending rows may lack the descriptor; they keep the
display name as their description until they post. **`externalId` stays built from the display
name**, so re-pastes and holds already stored keep their identity. Deploy the app before the
userscript: the parser rejects unknown keys.

### D5: Cutover keeps SimpleFIN's history

`history_source_since` = the day of the last SimpleFIN posted row on Capital One. SimpleFIN rows
stay exactly as they are. The cutover is a dry-run-first script (the pattern of
`scripts/single-pool-cutover.ts`) whose receipt lists three things:

- page rows in the overlap that SimpleFIN appears to have missed (nothing is inserted
  automatically);
- SimpleFIN pending holds on Capital One, retired with their state carried onto the matching page
  hold where one pairs, otherwise listed;
- the link to unlink.

Applied only after Lee reads it, and audited. Chase gets the same kind of receipt for its
leftover `scrape:chase` holds.

### D6: A closed statement is history for a page-sourced account

`recentPosted` rows for a `bank_page` account are inserted when no stored row holds them (by
`externalId`, then page-to-page `sameEvent`) and they post after `history_source_since`. So
pasting at least once per statement cycle is complete on its own.

### D7: Statement files fill only periods no paste covered

Each paste records the day ranges it read completely in a new `finance_capture_coverage` table
(user, account, from, through, audit event): the current cycle through the day before the paste, plus the closed statement when
`completeness.recentPosted` holds. Derive a statement's start from Capital One's fixed monthly
close day, checked against stored statements. For a `bank_page` account, a CSV/PDF import inserts
a row only when its date is outside every covered range and after `history_source_since`. A PDF
still records its statement balance and rates either way.

### Direction of error

A charge is missing (caught by the Accounts mismatch line and Reconcile, per ledger D3/D5) rather
than duplicated.

## Out of scope

- Plaid or any other feed; making Chase page-sourced.
- Rewriting past SimpleFIN rows' dates or descriptions.
- Manual merging or editing of bank fields in the register (a separate request, not shaped here).
- Removing the page↔feed pairing machinery. It still serves SimpleFIN accounts' own
  holds; prune it in a later spec once nothing calls it.

## Acceptance criteria

- [ ] A Capital One paste with SimpleFIN unlinked succeeds, sets the headline, and inserts
      YouTube $16.95 dated purchase Sep 22 / posted Sep 22.
- [ ] Replaying a Kim's-style capture turns the $50 hold into the $60 posted row: transaction
      date 9/19, posted date 9/21, envelope kept, one row.
- [ ] Re-pasting the same page inserts nothing. A paste after the statement closes inserts the
      closed statement's unheld rows once.
- [ ] A Chase paste is refused, and so is a paste for any account not `bank_page`. A sync never
      writes rows to a `bank_page` account.
- [ ] A Capital One CSV covering a pasted cycle inserts 0 rows; covering an uncovered month it
      inserts that month.
- [ ] The cutover dry run lists overlap misses, SimpleFIN holds and the link; apply is audited;
      Ready to Assign unchanged by the cutover itself.
- [ ] Integration tests: a second user fails to read, change or delete the first user's history
      source, coverage rows, and headline. No React component tests. `npm test` with no database
      skip warning. `npm run smoke` after touching `src/app/**`.

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                                                                                    | Why                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `history_source` defaults to `files`; the migration backfills `simplefin` for every linked account, and `linkAccount` promotes a `files` account to `simplefin` (never a `bank_page` one).                                                                                                                | The plan named the column but not its default. An unlinked account has no feed, and a link must not silently override Lee's `bank_page` choice.                                                                                                       |
| 2   | `recomputeAccountBalanceAuthority` derives no headline for a `files` account (it still records the file's source row).                                                                                                                                                                                    | Moving the headline to the account made "no link, no headline" false. Deriving one for file-only accounts would replace the statement anchor with a partial file's running balance and light up mismatches on accounts that never had a live balance. |
| 3   | Coverage-table isolation tests move to Task 3.                                                                                                                                                                                                                                                            | Nothing reads or writes `finance_capture_coverage` until the paste apply does; a test now would only exercise raw SQL.                                                                                                                                |
| 4   | The apply passes `feedCovered = false` outright rather than deriving it from the source.                                                                                                                                                                                                                  | Past the refusal of every non-`bank_page` account the derivation is a constant. The planner's feed-covered branches stay for now; pruning them belongs with the pairing machinery (out of scope).                                                     |
| 5   | The planner takes `postedAfter` (from `history_source_since`) and reports `postedBeforeSourceStart`; a paste says how many rows it left to the previous source.                                                                                                                                           | D3/D5 needed the cutoff to be visible in the receipt, or a missed row looks like a lost one.                                                                                                                                                          |
| 6   | A hold the closed statement lists (or that carries to a closed-statement row) is posted in place on a page-sourced account, instead of marked posted-at-bank.                                                                                                                                             | D6: for this account the closed statement is history, so the hold posts and keeps its envelope.                                                                                                                                                       |
| 7   | Coverage ranges: the current cycle starts the day after the closed statement (else the earliest posted row) and runs to the capture day; a closed statement starts at the stored statement's start, else one month before its close day plus a day. A later paste extends a range rather than adding one. | D7 left the derivation open.                                                                                                                                                                                                                          |
| 8   | The current cycle's coverage ends the day **before** the capture, not on it (supersedes row 7's "runs to the capture day").                                                                                                                                                                               | Lee (2026-09-24): an 8 am paste cannot vouch for a charge that posts at 3 pm, and a covered day refuses the statement row that is the backstop when no later paste comes.                                                                             |
| 9   | A sync ignores the provider account behind any link whose account is not `simplefin`: no rows, no balance, not counted as unlinked.                                                                                                                                                                       | Task 3 shipped before the cutover, so Capital One pastes were refused in production while its link still made it `simplefin`. Flipping it by hand before sync obeyed the source would have let SimpleFIN keep writing beside the page.                |
| 10  | The cutover's dry run is the apply transaction rolled back, and "page rows SimpleFIN missed" comes from the latest stored capture (audit evidence) run through the snapshot planner's `postedBeforeSourceStart`. Unpaired losing-source holds are kept and listed, not deleted.                           | The receipt must be exactly what `--apply` does; the capture is the only record of what the page showed; an unpaired hold may carry an envelope Lee wants to move by hand.                                                                            |

> While this spec is **active**, when we make a material change to requirements, design, or scope
> (including from feedback on what was implemented), update the relevant sections and append to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation **done**

plan.md (this), shape.md (scope, Lee's four answers on 2026-09-23: A for Chase / B for Capital
One; keep SimpleFIN history with a cutover date; statement descriptor + display name; files only
for uncovered periods), standards.md pinned at `30a9c769`, references.md, `visuals/` (four
session screenshots: Kim's Nails detail, YouTube detail, the userscript toast, the paste summary).

## Task 2: History source and account-level headline (schema) **done**

Migration adding `history_source`/`history_source_since`, moving the headline cache onto
`finance_accounts` with a backfill from links, and adding `bank_display_name` and
`finance_capture_coverage`. Move the readers (D2). Keep a single writer. Integration tests with
second-user isolation.

## Task 3: Snapshot apply by source **done**

`applyBankBrowserSnapshot` resolves the source, refuses non-`bank_page`, drops the link guard,
passes `feedCovered` from D1, inserts `recentPosted` per D6, writes coverage (D7). Unit tests in
`bankSnapshotReconcile.test.ts` (YouTube insert, Kim's transition, re-paste idempotent, closed
statement once); integration in `bankSnapshotApply.integration.test.ts`.

## Task 4: Userscript and parser: statement descriptor

`capitalone-pending.user.js` captures "Appears on statement as"; `bankSnapshot.ts` accepts an
optional row field; apply writes `description`/`bank_display_name` per D4. Retire the Chase script
and its paste UI.

## Task 5: Sync and file imports obey the source **done**

`syncPlan`/`sync.ts` skip non-`simplefin` accounts. `import.ts` applies the D7 coverage gate for
`bank_page` accounts. Tests for both.

## Task 6: Cutover script **script done; production run pending Lee's read of the dry run**

`scripts/history-source-cutover.ts`: dry-run receipt, then `--apply` (audited) for Capital One
and Chase per D5. Run the dry run against production with Lee, then apply.

## Task 7: Verify, freeze, update roadmap

Acceptance criteria above. Update memory `bank-feed-workflow`. Freeze with the standards SHA. Log
on the roadmap's finance section.
