# Ready to Assign from the ledger; bank pages stop writing posted history

**Status: active**
Spec folder: `agent-os/specs/2026-09-14-1004-ledger-ready-to-assign/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-24-2206-single-pool-budget/` **D3** — current Ready to
  Assign no longer reconciles to the bank working pool. D2's pool stays as a _diagnostic_
  (bank position), not an RTA input. **D5** (rebase opening on membership change) is replaced by
  per-account openings (D2 below).
- **Supersedes:** `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/` — only the
  `Account reconciliation` term in the derivation; the equation layout and uncategorized tray stay.
- **Supersedes:** `agent-os/specs/2026-09-13-1127-ingest-by-identity/` **D2 insertion direction**
  and its "Direction of error" (visible duplicate preferred). Retirement pairing, D3a/D3b, D4, D5
  carry forward, with D3b's successor match changed (D4 below).
- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` — page captures
  remain audited; they stay the authority for pending holds and a balance.
- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — Actual's fold is unchanged.
- **Follow-up closed:** ingest-by-identity's "opening rebase for the −$122.09" is answered by
  D2 + D5 here rather than a separate rebase.

## Context

Ready to Assign has moved after routine transaction refreshes over and over: −$5.19 on Sep 13
(ingest-by-identity), and +$45.53 on Sep 14. Each time a different ingestion defect was fixed, and
each time the next defect reached the same number, because single-pool D3 defines
**RTA = bank working pool − envelopes − held**. Any disagreement between the bank headline and the
register — a duplicate, a missing row, a wrong sign, a stale balance — lands in `Account
reconciliation` and silently changes RTA.

Sep 14 evidence (audit event `89f8b4e3…`, Chase bank snapshot 09:34): 14 "new posted" rows, all
already held by SimpleFIN — 12 Amazon charges whose page names (`Amazon.com`, `Amazon Marketplace,
Amazon.com`, `Amazon Prime Membership`) share no description rule with the feed descriptors
(`Amazon.com*5Q5TU2OG1`, `AMAZON MKTPL*537NK9DZ2`, `AMAZON PRIME*4H6016CM3`), one −$13.77, and
`PAYMENT THANK YOU` read as **−$455.51** beside the feed's +$455.51. Auto-filed to General
Spending, they created Overspent last month −$284.04 and moved RTA $0.00 → $45.53. The Activity
grid's Headline impact read $0.00 because it measures the bank pool. The Aug 29 watermark commit
had predicted exactly this ("a double-counted row moves budget numbers and is caught by nobody");
6db23f2e removed the watermark on Sep 13 in favor of description pairing, which cannot bridge page
display names. Same class: Aug 29 Capital One (Pizza Hut/Walmart), Sep 13 Walmart −$195.56 and the
`Payment from CAPITAL ONE N.A.` / `CAPITAL ONE ONLINE PYMT` pairs.

Lee's expectation, which is YNAB's and Actual's: **only income and assigning move Ready to
Assign.** Bad data should be visible as a mismatch to fix, never as a quietly different headline.

## Decisions

### D1 — Ready to Assign is ledger-derived

For every month, including the current one:

```text
readyToAssign = fromLastMonth + income + overspentLastMonth − assigned − held
              + uncategorizedActivity − assignedInFutureMonths
```

`fromLastMonth` in the start month is Σ per-account openings (D2). No term reads a bank headline.
`accountReconciliationCents` and `CurrentPoolInput.accountPoolCents` leave `buildBudget`. The
ledger identity replaces the pool identity (`membership.ts` assertion):

```text
ledgerPool = Σ openings + Σ on-budget money rows since start (selected pending included)
ledgerPool = readyToAssign + envelopeBalances + held + assignedInFuture + unmatchedTransfers
```

`unmatchedTransfers` = net of on-budget transfer-flow rows since start (a correct set nets to 0).
Uncategorized activity stays an RTA term (YNAB: money without a job is unassigned).

### D2 — Per-account budget openings are stored

The recorded total `openingCents` and the read-time `openingPositionFor` recomputation are two
answers to one missing fact. Store `budgetOpeningCents` per on-budget account (position the day
before the start month). Budget opening = Σ over on-budget accounts. Membership change (single-pool
D5) becomes adding/removing that account's opening — no separate rebase arithmetic.

Seeding (cutover): statement closing balance on/before the start day plus register rows between
that close and the start, where a statement covers it; otherwise today's `openingPositionFor` for
that account, flagged as "seeded from the bank headline" in the receipt. The seed must not absorb
post-start register errors into openings where a statement exists.

**Rollout (Lee, 2026-09-14):** `budget_opening_cents` lands nullable and Task 8's cutover is what
actually seeds existing accounts from statements — so `loadBudget` cannot switch straight to
`Σ budgetOpeningCents` in the same change without going blind (all null) for every account between
this task landing and Task 8 running, on a single-user app Lee checks on the phone. Chosen fix:
`effectiveOpeningCents` sums per-account openings **only once every on-budget account has one**;
until then it reads the pre-existing `settings.openingCents` total exactly as before, which
`membership.ts` keeps maintaining by the same delta arithmetic alongside the new per-account writes.
Nothing changes for Lee before Task 8 runs; the fallback is dead weight after, by construction
rather than by a later removal pass.

### D3 — Mismatches are warnings with links, never RTA terms

The Budget card keeps the equation without `Account reconciliation`, and adds one amber
"doesn't match the bank" line when any is non-zero, linking to Accounts:

- per account: bank working balance − (opening + rows since start)
- unmatched transfers since start (links to the register filtered to those rows)

Accounts shows the per-account figure. The Activity grid's Headline impact column measures
**Ready to Assign** change (the pool change remains in the detail pane).

### D4 — Bank pages never write posted history for feed-covered accounts

An account is feed-covered when it has a history feed link (SimpleFIN) — Chase •••9910 and
Capital One •••3448 today. For those, `planBankSnapshotReconciliation` inserts **no** posted rows.
The page remains the authority for: the balance, the complete pending set (D3a), and noticing that
one of its holds has posted.

- A stored page hold that appears in the page's posted list **stays in the register as a hold
  marked posted-at-bank** (not deleted by D3a, envelope intact) until a feed posted row succeeds it.
- Successor match for holds (retirement and D3b): exact or 7.5% band amount, date ≤ 7 days,
  description used to **rank**, not to gate. Exactly one candidate, or one clear description
  winner → carry state and retire. Several with no description winner → keep the hold, warn.
  On retirement the **feed row's description wins** (`AMAZON MKTPL*537NK9DZ2` over the page's
  `Amazon.com`) — the feed descriptor carries more identifying information, and the page's
  scraped text was always a placeholder standing in until a better-sourced row arrived, not a
  value worth preserving over it.
- Accounts with no history feed keep today's page posted path.

Direction of error: a charge the feed is late on is missing until SimpleFIN or a CSV brings it.
Under D1 that is a D3 warning, not an RTA change.

### D5 — Reconcile is a deliberate, audited adjustment

Per account, YNAB-style: Lee confirms the bank balance; if D3's difference remains after fixing
rows, Reconcile writes one `reconciliation adjustment` transaction (flow: income-like, category
Ready to Assign) dated today, recorded in the finance audit. It is the only way a bank difference
moves RTA. No automatic rebase at cutover.

### D6 — Chase page payment sign

Read the stored raw `amount` for `PAYMENT THANK YOU - WEB` from the Sep 14 event's source evidence
and fix the userscript/parse so credits keep their sign (suspected non-ASCII minus not matched by
`AMOUNT`). Still relevant for pending credits and non-feed accounts.

## Out of scope

- Rewriting past months' history or their displayed headlines.
- A YNAB credit-card payment envelope (Actual's card model stays, per memory).
- Capital One/SimpleFIN description improvements beyond D4's ranking.
- Deleting existing duplicate rows automatically — Task 7 reports; Lee deletes.

## Acceptance criteria

- [x] Replaying the Sep 14 Chase capture (fixture from the audit event) inserts 0 posted rows and
      leaves RTA unchanged.
- [ ] A duplicate categorized charge written straight into the ledger overspends its envelope
      and leaves current RTA unchanged; a bank headline change alone leaves RTA unchanged.
- [x] Income arriving and assign/unassign are the only fold inputs that move RTA (unit tests), plus
      uncategorized activity and Reconcile adjustments. _(Reconcile adjustments: Task 6.)_
- [x] Ledger identity holds in every budget/snapshot/handover suite (`assertPoolIdentity` replaced).
- [x] A hold posted at the bank survives D3a with its envelope and is retired onto the SimpleFIN
      row when it arrives, including an Amazon-style description mismatch.
- [x] Per-account openings sum to the budget opening; membership change adds/removes one account's
      opening; cross-user cases on every new mutation.
- [x] Budget card shows the mismatch line (per account + unmatched transfers) and no reconciliation
      term; Activity Headline impact is RTA delta.
- [x] Reconcile writes one audited adjustment that moves RTA by exactly the confirmed difference.
- [ ] Production cutover dry-run receipt shows before/after RTA, per-account openings and their
      seed source, mismatches; applied only after Lee reads it.

## Changes from original plan

| #   | Change                                                                                                                   | Why                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | D4 retirement: feed row's description wins over the page's, on hold→feed carry-state.                                    | Lee: the feed descriptor has more information; page-scraped text is a placeholder until a better source arrives.                                                                                              |
| 2   | D2 rollout: `loadBudget` falls back to the legacy total until every on-budget account is seeded.                         | Lee's call between three rollout options — keeps the live app unchanged between Task 3 landing and Task 8's cutover.                                                                                          |
| 3   | D4's description-ranks-not-gates rule applies to `resolveLostHold` (D3b) only; `pairRows`'s batch matching is unchanged. | Applying it to `pairRows` too would have called the "two identical same-day charges" case ambiguous and broken pairing that already works — a bipartite-matching concern D3b's per-hold search doesn't share. |
| 4   | D4 also excludes `postedAtBank`-flagged rows from `loadWorkingPendingSelection`'s pending-money sum.                     | Found writing the integration tests: without it, a flagged hold's money double-counts against the browser headline that already reports it posted.                                                            |

> While this spec is **active**, when we make a material change to requirements, design, or scope
> (including from feedback on what was implemented), update the relevant sections and append to
> **Changes from original plan**. Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation **done**

Create the folder with `plan.md` (this), `shape.md` (scope, Sep 14 evidence, Lee's three answers:
pages stop adding posted rows; warn and keep out of RTA; show the cutover drop and add Reconcile),
`standards.md` pinned at `30a9c769`, `references.md`. No visuals.

## Task 2: Ledger-derived fold (pure) **done**

`src/lib/finances/budget/envelope.ts`: drop `accountPoolCents`/`accountReconciliationCents` from
`CurrentPoolInput`/`BudgetMonth`/terms; keep uncategorized. Add a pure `ledgerIdentity` (replacing
the pool check in `membership.ts`) and `unmatchedTransferCents`. Update `envelope.test.ts`,
`membership` tests, `export.ts`, `fixThis.ts`/`operations.ts` callers (they only read RTA). Check
`docs/actual-budget/README.md` → `loot-core/.../budget/envelope.ts` for To Budget parity.

## Task 3: Per-account openings (schema + seed) **done**

Generated migration `0096` adding `finance_accounts.budget_opening_cents` (nullable). `loadBudget`
sums it via `effectiveOpeningCents`, falling back to the legacy `settings.openingCents` total until
every on-budget account is seeded (rollout note above). `membership.ts`'s three mutations
(`rebaseAccountMembership`, `includeNewOnBudgetAccount`, `applySinglePoolCutover`) and `seedBudget`
(`budget/mutations.ts`) now write a joining account's own opening alongside the legacy total's
existing delta maintenance. Pure statement-first/headline-fallback seed logic and label in
`src/lib/finances/budget/openingSeed.ts` + `openingSeed.test.ts` (the statement-lookup orchestration
itself is Task 8's). Integration tests: per-account seeding on join, staleness on leave, the
fallback-then-sum transition, and a second user unable to touch the first user's opening.

## Task 4: Mismatch model and UI **done**

`loadBudgetMismatch` (`budget/queries.ts`) computes per-account bank-vs-ledger drift
(`openingPositionFor(…, [accountId]) − budgetOpeningCents`, D3's own formula rearranged to reuse
that query) and the net of unpaired on-budget transfer-flow rows since start, via the pure
`unmatchedTransferCents` from Task 2. `BudgetSummary.tsx` drops the stale pool-equals-RTA caption
and adds the amber "doesn't match the bank" line (uncategorized-tray pattern), linking to Accounts.
`AccountsView`/`accountColumns.tsx` gained a Mismatch column, sortable and filterable, fed through
`operationalAccountRows`. `audit/checkpoints.ts`/`types.ts`/`export.ts`/`ActivityDrawer.tsx` carry
`mismatchTotalCents` alongside RTA. `listFinanceAuditEvents`'s `headlineImpactCents` now diffs
`budgets[0].readyToAssignCents` instead of `accountPoolCents` — verified against a real assign
(pool unchanged, RTA moved) in a new integration test. `src/lib/agent/*` never exposed
`accountReconciliationCents`, so there was nothing to follow there.

Verified against real dev data: the Budget card and Accounts grid both render correctly with
every account's mismatch showing as "—" (none seeded yet, exactly the rollout design), and the
Activity grid's Headline impact column correctly shows a nonzero RTA delta for a historical
SimpleFIN sync that the old pool-based column would have hidden.

## Task 5: Bank pages stop writing posted history **done**

`planBankSnapshotReconciliation` gained a `feedCovered` parameter (always true for its one caller
today — both scraped cards already carry a SimpleFIN link — kept explicit rather than assumed,
since D4's rule is about accounts with a history feed, not about this one caller). When true: an
incoming posted row with no stored match is dropped, never inserted; one that matches a stored
hold is flagged `postedAtBankMarks` (new `finance_transactions.posted_at_bank`, migration 0097)
instead of transitioning it to posted — envelope, notes and split untouched, only the first
capture to notice it writes the stamp. `feedPairing.ts`'s `resolveLostHold` (D3b) drops the
description gate: exactly one amount+date-qualifying row retires the hold regardless of
description; several retire it only with one clear description winner; several with none is a
new `"ambiguous"` outcome — kept, not deleted, warned instead of guessed.

**`pairRows` itself stays unchanged** — a deliberate scope decision, not an oversight. It does
global bipartite matching (many rows against many rows at once, e.g. two identical same-day
charges pairing 1:1), where "several candidates, no clear winner" already covers the legitimate
mutually-interchangeable-duplicate case; applying D3b's per-hold ambiguity rule there would have
flagged that case ambiguous too and broken pairing that already works. `resolveLostHold` is a
per-hold search over a small, already-relevant candidate set, where the new rule is safe. Every
existing `pairRows` test (including both ChatGPT/Claude regression tests) still passes unchanged.

**Found and fixed while writing the integration tests, not before them:** flagging a hold
posted-at-bank without excluding it from `loadWorkingPendingSelection`'s pending-money sum
double-counts it — the browser headline balance already reflects it as posted, and the row was
still being added again as "pending" on top. Fixed by excluding `postedAtBank IS NOT NULL` rows
from that one query only (`workingPendingQuery.ts`) — envelope activity, opening-position and
backlog math all keep counting the row normally via the ordinary money-rows sum, since they never
consult that selection.

Tests: unit (`bankSnapshotReconcile.test.ts`, `feedPairing.test.ts`) cover the Sep 14 replay shape,
Amazon-style hold retirement despite a page/feed description mismatch, the ambiguous-keep-warn
outcome, and ChatGPT/Claude through both `pairRows` and the new `resolveLostHold`. Integration
(`bankSnapshotApply.integration.test.ts`) replays the actual incident shape end to end (0 inserted,
RTA unchanged) and verifies the double-count fix against real Postgres. Verified against real dev
data: Accounts and Budget render unchanged (no rows are flagged yet, exactly the rollout design).

## Task 6: Reconcile action **done**

Pure `src/lib/finances/reconcileAdjustment.ts` (difference, adjustment row) + test; audited
mutation (`reconciliation_adjustment` audit kind) with cross-user integration test; Accounts
row command per `components/navigation` (Item menu + command registry + row menu), confirm
dialog on `ModalShell` via `ConfirmDialog`. The mutation re-reads D3's mismatch inside the
transaction rather than trusting the dialog's figure. A Reconcile adjustment stays
uncategorized (that is what makes it an RTA term) but is excluded from `uncategorizedCount`
so it does not nag to be filed. The command is disabled with a reason when the account is
off-budget, unseeded, or already matches.

## Task 7: Chase sign fix and duplicate report

D6 fix in `scripts/chase-pending.user.js` / `bankSnapshot.ts` parse with a test on the raw text.
Read-only script `scripts/scrape-duplicate-report.ts` listing `scrape:*` posted rows on
feed-covered accounts with an amount+date feed twin (Sep 13 Walmart, Capital One payment pairs) for
Lee to delete by hand.

## Task 8: Cutover

`scripts/ledger-rta-cutover.ts` modeled on `scripts/single-pool-cutover.ts`: dry-run/apply, seeds
openings, receipt with before/after RTA, per-account openings and seed source, mismatches,
unmatched transfers; idempotent; aborts on identity failure. Take a verified backup first. Lee
reviews the dry run before apply.

## Task 9: Verify, freeze, roadmap

`npm run lint`, `typecheck`, `npm test` (integration ran, no skip warning), dev server +
`npm run smoke` (touches `src/app/**` via Budget/Accounts/Activity). After deploy: Lee runs both
bank-page scripts and a sync; RTA does not move; Budget card mismatch line matches Accounts.
Freeze both files, record drift, update roadmap's Ready to Assign entries.
