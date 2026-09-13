# Ingest by identity, not by date

**Status: active**
Spec folder: `agent-os/specs/2026-09-13-1127-ingest-by-identity/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` **D1–D3**, meaning the
  feed watermark as the thing that decides which rows exist. D4 (user state crosses the handover)
  carries forward and gets a better matcher. D5–D8 are untouched.
- **Supersedes:** `agent-os/specs/2026-09-01-1205-source-as-of-authority/` **D2**, only for the
  tie between a same-day file and a feed/browser instant. Every other part of the comparison stays.
- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/`, where the complete
  pending set lets a bank-page capture remove holds that are gone.
- **Extends:** `agent-os/specs/2026-08-31-1444-separate-finance-authority-state/`
- **Extends:** `agent-os/specs/2026-08-15-1315-live-bank-sync/`, the sync window.

## Context

On 2026-09-13 Ready to Assign went to −$5.19 after a normal weekend of SimpleFIN syncs, bank-page
script runs and a Capital One CSV import. Read-only production evidence (audit events and changes,
`finance_account_source_state`, statements) shows four defects that share one wrong assumption:
**that a date tells us whether a feed has delivered a charge.**

1. **A sync deletes browser rows by date.** `retireCoveredScrapeRows` deletes every `scrape:*` row
   dated on or before the feed's latest posted day. On Sep 10 SimpleFIN delivered Capital One's
   Sep 8–9 rows but not Sep 1–7, and 11 posted, categorized rows were deleted anyway: SMECO
   $263.15, Dropbox, HUEL, Chewy, Neon, Gray Mirror and others. For about two days that money was
   missing and the envelopes and notes were lost. Since Sep 10 there have been 24 "no matching row
   could be found" warnings.
2. **Pending holds churn.** Holds still pending at the bank (Vetsource $29.70, Domino's $20.11,
   Starbucks $5.57, Apple $3.08) were deleted because their date fell before the watermark. The
   next bank-page run re-added them and the next sync deleted them again, 3–4 times, dropping the
   category each time. At the time of shaping none of the three are in the register, which
   overstates Ready to Assign by $55.38.
3. **The sync window slides past a stalled account.** Capital One's SimpleFIN data stalled from
   Sep 3 to Sep 9: zero new rows, balance stuck at Sep 8. It then caught up out of order.
   `syncWindow` fetches from `syncedThrough − 7`, and `syncedThrough` advances to today on every
   sync even when an account is stale. When SimpleFIN finally had SMECO and Neon (posted Sep 2),
   we were requesting from Sep 3 onward, so they never arrived. SimpleFIN was late, not lossy.
4. **A same-day file balance loses to a stale feed instant.** At 7:20 PM on Sep 12 the Capital One
   CSV brought posted Apple rows (−$5.19) and a balance of −$5.19 dated `2026-09-12`. SimpleFIN's
   $0.00, as of 6:18 PM the same day, was kept, because a mixed-precision tie keeps the incumbent.
   Rows came in without their balance, which created $5.19 of Ready to Assign. The 7:22 PM
   underfunded fill assigned it, and the next morning's bank-page capture corrected the balance to
   −$5.19. (Lee's card balance is −$5.19.)

The matcher behind D4 also misfired. With no per-row date limit, the scraped **ChatGPT** −$21.20
carried its envelope onto SimpleFIN's **Claude** −$21.20 row, two days away, because ChatGPT's own
feed row had not arrived yet.

Not caused by this: the stable −$122.09 Account reconciliation. Production confirms it is exactly
the opening balance recomputed today ($439.81) minus the opening recorded at setup ($561.90).
Checking and savings match every statement to the cent. The gap predates the audit log and sits in
the two cards. It is out of scope here (see Follow-ups).

## Decisions

### D1: A posted row leaves the register only when a successor is identified

A posted charge does not disappear at the bank. A reversal is its own transaction. So no ingestion
path deletes a posted row because a feed's dates now cover it. A `scrape:*` posted row is retired
only when a history-feed row (`api:simplefin`, `csv:*`) is **paired** with it. The feed row
inherits its user state (D4 of the prior spec). A posted row with no pair stays; if it really is
wrong, Lee deletes it by hand.

### D2: One pairing rule for both directions

A single pure module pairs browser rows with history-feed rows for one account:

- **exact amount**
- `dateDistance` (closest of the four transaction/posted pairings) ≤ `DATE_TOLERANCE_DAYS`, **per
  row**, not only inside the candidate query's window
- **global nearest-first**: sort all candidate pairs by distance, then description overlap
  (`descriptionsOverlap`) as the tiebreak, then id, and take pairs greedily. This way ChatGPT waits
  for its own row instead of taking Claude's.
- occurrence-counted: each row pairs at most once.

The same rule is used in **both directions**:

- **Retirement** (sync, file import): pair stored scrape rows with stored feed rows; retire only
  the paired rows.
- **Insertion** (bank-page snapshot): an incoming posted row that pairs with a stored feed row is
  already present and is skipped. Anything unpaired is inserted, **whatever its date**. This
  replaces the watermark drop, so a charge SimpleFIN is late on is filled by the page. If
  SimpleFIN delivers it later, the next retirement pass pairs the two and removes the page copy.

With both directions pairing, the feed watermark no longer decides anything.
`splitByWatermark`, `coveredByFeed` and the ownership reading of `feedWatermarkForAccount` are
deleted rather than kept alongside. The receipt counts "already held by the bank feed" from
pairings instead.

### D3: Pending rows are removed by the bank page's complete pending list, or by pairing

- A scrape **pending** row is never retired by a sync or file import because of its date. It is
  retired only when a posted feed row pairs with it under D2, or by D3b.
- **D3a:** the bank-page capture is the authority for its own pending set (already built in
  `planBankSnapshotReconciliation`). A hold the page no longer lists is removed on the next run.
  That covers the duplicate Xfinity hold that never posted. This spec's job is to make that path
  correct once the watermark drop is gone, so a pending row whose posted twin is dated in the past
  transitions or pairs instead of being deleted as "omitted".
- **D3b (lost holds):** before removing an omitted hold, try to move its envelope and notes to a
  posted row within Actual's 7.5% band (`amountMatches`), `dateDistance` ≤ a pending-specific
  tolerance (7 days, so it covers how long a hold lasts), and `descriptionsOverlap`. Exactly one
  candidate → carry the state and remove the hold. None or several → remove the hold and add a
  warning to the receipt and the audit event.

### D4: The sync window anchors on the stalest linked account

`syncedThrough` stops meaning "the day we last called" and becomes **the oldest account
`balance-date` day in the response**, capped at today. The next fetch starts at that day minus
`OVERLAP_DAYS`, floored by `MAX_INITIAL_DAYS`. An account that stalls keeps the window open until
it catches up. A response with no `balance-date` for an account does not advance the anchor for
that account.

### D5: A same-day file balance wins when its rows show it is more current

Source-as-of D2 carries forward except for one case: a `file` stamp (day only) ties on the
calendar day with an instant stamp. The tie is broken by evidence, in a pure function:

- the file holds a posted row dated that day that the other source does not hold → **file wins**
- the other source holds a posted row dated that day the file does not → **the other source wins**
- both or neither → **the incumbent stays**, and the receipt says so.

On Sep 12 the file held two Apple rows posted that day that SimpleFIN did not, so the file would
have won and no $5.19 would have been created.

### Direction of error

A pair missed under D2 leaves a visible duplicate that can be deleted. A wrong deletion removes
money nobody sees. This spec chooses the visible duplicate, and every unpaired row that is kept
and every hold removed without a successor is named in the receipt.

## Acceptance criteria

- [ ] **Sep 10 replay:** scrape posted rows dated Sep 1–7 plus a SimpleFIN delivery of only Sep
      8–9 → no scrape row is deleted. Delivering Sep 3–7 a day later retires exactly those rows,
      and each feed row inherits the envelope and notes.
- [ ] **ChatGPT/Claude:** a scrape ChatGPT −$21.20 (Sep 7) with only SimpleFIN's Claude −$21.20
      (Sep 9) present does **not** pair. Once ChatGPT's own feed row arrives, each pairs with its
      own.
- [ ] **Pending churn:** a scrape hold dated before the latest feed day, with no posted twin,
      survives any number of syncs and imports. The next bank-page capture that still lists it
      keeps it, and one that omits it removes it.
- [ ] **Lost hold:** a $20.11 hold whose charge posts at $23.11 (tip, within 7.5%) with a matching
      merchant carries its envelope and notes. A vanished duplicate hold (Xfinity) is removed with
      a warning.
- [ ] **Late feed, page fills:** a bank-page posted row dated before SimpleFIN's latest day, with no
      paired feed row, is inserted. A later SimpleFIN delivery of the same charge retires the page
      copy. Balance and Ready to Assign count the charge exactly once throughout.
- [ ] **Stalled account:** accounts with `balance-date`s of Sep 8 and Sep 12 → `syncedThrough` is
      Sep 8 and the next fetch starts Sep 1.
- [ ] **Same-day tie:** feed $0.00 at 18:18 on Sep 12 plus a file dated Sep 12 holding two Apple
      rows posted that day → the file's −$5.19 is the headline. The reverse case keeps the feed.
- [ ] `assertPoolIdentity` holds in every scenario above, and the watermark module's ownership
      functions are gone.
- [ ] Every new or changed mutation test includes a second user who cannot read, change or delete
      the first user's rows.

## Changes from original plan

| #   | Change                                                                                                                    | Why                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D3b's posted-row candidates are the account's stored posted rows only, not this same snapshot's own incoming posted list. | Extending it to incoming rows needs the apply layer to resolve a not-yet-inserted row's id after the insert, which is real plumbing for a case the acceptance criteria don't distinguish from the cross-capture one. The stored-only version already carries the Domino's-tip and Xfinity-duplicate examples; a same-capture tip charge is carried on the next reconciliation once it is stored, one cycle later than the cross-capture case. |

> While this spec is **active**, when we make a material change to requirements, design, or scope
> (including from feedback on what was implemented), update the relevant sections and append to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation

Create `agent-os/specs/2026-09-13-1127-ingest-by-identity/` with `plan.md` (this plan), `shape.md`
(scope, the four defects with their production evidence, Lee's answers: posted never disappears,
the page's pending list clears holds, carry lost holds to a near match, include the balance tie),
`standards.md` pinned at `c06db72a`, and `references.md`. No visuals.

## Task 2: Pairing module (pure)

New `src/lib/finances/feedPairing.ts` + `feedPairing.test.ts`: D2's global nearest-first,
occurrence-counted pairing over `{id, transactionDate, postedDate, amountCents, description}`,
reusing `dateDistance`, `descriptionsOverlap` and `DATE_TOLERANCE_DAYS` from `liveFeedMatch.ts`.
Also the D3b lost-hold carry rule, reusing `amountMatches` from `amountMatch.ts`. Tests include the
ChatGPT/Claude case, two identical same-day charges, and the Sep 10 partial delivery.

## Task 3: Retirement by pairing

Rework `planFeedHandover` (`feedHandover.ts`) to consume pairings: unpaired rows produce **no
step**. Posted and pending alike stay. Keep `carryableFields` and the split move.
`retireCoveredScrapeRows` (`feedHandoverWrite.ts`) loads the account's scrape rows and the feed
rows within tolerance of them, with no watermark filter, and deletes only paired rows. Callers:
`banksync/mutations.ts:526`, `finances/import.ts:700`. Update `feedHandover.test.ts` and
`feedHandoverWrite.integration.test.ts` (Sep 10 replay, pending churn, cross-user).

## Task 4: Snapshot insertion by pairing; pending path correct

In `planBankSnapshotReconciliation` (`bankSnapshotReconcile.ts`), replace `splitByWatermark` with
pairing against stored history-feed rows (the apply layer passes them in). Paired incoming posted
rows count as "already held by the bank feed", and also resolve a browser pending twin, carrying
its state to the feed row. Unpaired rows go through the existing duplicate/transition/insert paths.
Omitted browser holds go through D3b before deletion. Update `bankSnapshotApply.ts`,
`bankSnapshotReconcile.test.ts` and `bankSnapshotApply.integration.test.ts`. Delete the ownership
functions in `feedWatermark.ts` and their tests, plus any remaining import (`import.ts:417`
comment/filter).

## Task 5: Sync window anchors on the stalest account

`sync.ts`: compute `syncedThrough` as the minimum account `balance-date` day in the response
(`balanceAsOf` in `banksync/mapping.ts`, reduced with `toDateKey`), capped at today, and unchanged
for accounts with no date. `syncWindow` (`crossSource.ts`) stays. Test in `syncPlan.test.ts` /
`crossSource.test.ts` for the Sep 8 / Sep 12 case, plus an integration assertion that the stored
`syncedThrough` does not pass a stale account.

## Task 6: Same-day evidence tiebreak

`sourceAuthority.ts`: extend the comparison with an optional per-source "posted days held"
evidence input for the file-vs-instant same-day case (D5). The write path
(`sourceStateWrite.ts` / `recomputeAccountBalanceAuthority`, `importedPostedBalance.ts`) supplies
posted rows dated on the tie day per source. Unit tests for both directions and the
both/neither case; an integration test replaying Sep 12.

## Task 7: Verify against production data, then freeze

- `npm run lint`, `npm run typecheck`, `npm test` (confirm integration ran, no skip warning).
  Touches no `src/app/**`, so no smoke unless that changes.
- Read-only replay: take a fresh `backup:run` restored locally (or the read-only prod role). Run a
  scratch script that feeds the Sep 10–13 audited deliveries through the new planners and prints
  what would be retired/inserted, confirming no posted deletions and no ChatGPT/Claude cross-carry.
- After deploy, Lee runs the Capital One bank-page script. The three missing holds come back and
  survive the next sync.
- Freeze: status, as-built drift, Follow-ups. Roadmap only if a matching item exists.

## Follow-ups (new work, not in this spec)

- **Opening rebase for the −$122.09:** a deliberate, audited way to accept today's reconciliation
  into the recorded opening. It is a decision about recorded history, not an ingestion bug.
- **Underfunded fill against a just-changed headline:** consider whether automatic assign options
  should refuse to run while a source's rows and balance disagree.
