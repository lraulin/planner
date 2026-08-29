# Feed ownership: SimpleFIN owns history, the browser snapshot owns the tail

**Status: frozen / complete** (2026-08-29)
Spec folder: `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/`

This document is the durable record of **what was built and why**. Further change to feed
ownership, the handover, or the bill-claim rule opens a **new delta-spec** rather than
editing this file.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` — the complete
  versioned snapshot contract, atomic application, the 36-hour browser-pending authority
  window, and the append-only finance audit all carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-29-0845-bank-snapshots-finance-audit/` D2, in the
  part that reconciles **incoming posted rows against existing posted history by
  exact-amount / description-overlap / ±2-day matching**. Ownership is now decided by date
  against a feed watermark; no cross-source description comparison remains on the posted path.
- **Supersedes:** `agent-os/specs/2026-08-15-1315-live-bank-sync/` — narrowly, the use of the
  cross-source matcher between SimpleFIN and browser capture. The matcher itself stays for
  what it was built for; it stops being how these two feeds tell their rows apart.
- **Supersedes:** `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D3, narrowly:
  a **bill's** claim files only that bill's own charge, not every charge from the merchant.
  A non-bill envelope's claim is unchanged.
- **Extends:** `agent-os/specs/2026-08-26-2022-split-transactions/` — split state moves across
  a feed handover only when it transfers without changing its financial meaning.

## Context

The workflow this app has to serve: sync SimpleFIN, find it behind, run the Tampermonkey
scripts to capture what has posted since, repeat. Nothing is ever entered by hand.

Today both sources write into the same date range, and Planner tries to tell their rows apart
by comparing descriptions. That cannot be made to work, and this spec exists because the
attempt was measured rather than assumed:

- **Capital One's web UI never exposes the raw descriptor.** The expanded detail for a pending
  charge gives `Pizza Hut · Dining · $12.71 · 21600 Great Mills Rd, LEXINGTON PAR, MD 20653 ·
Purchased: Fri, Aug 28, 2026`. The store number `036874` that SimpleFIN sends as
  `PIZZA HUT 036874` is absent from the whole DOM, replaced by a street address. Prior-statement
  rows read the same way ("MetLife", "Comcast", "Walmart"); Capital One falls back to a raw
  string only for merchants it has no clean name for (`LINK.COM* SIMPLEFIN BR`). Capturing
  SimpleFIN-shaped descriptors is therefore impossible, not merely unimplemented.
- **The cost of guessing, on real data (2026-08-29).** Seven Capital One transactions in the
  current cycle existed twice in the register — Pizza Hut, Walmart, Go Daddy, CVS, Apple,
  GitHub, and the $657.62 payment — each once under the page's name and once under SimpleFIN's
  descriptor. Chase's pending list showed six rows where the bank showed two ($42.38 and
  $42.33, totalling the $84.71 Chase itself reports), the extras being one duplicate pair and
  two SimpleFIN holds that had already posted.
- **A brand-stem matcher is not the fix.** `1d6d0ce` made six of the seven match by stripping
  `PAYPAL *`/`PP*` and comparing stems. The seventh — `Payment from CAPITAL ONE N.A. ...2322`
  against `CAPITAL ONE MOBILE PYMT` — shares no stem with its counterpart and never will.

The correction is to give the two feeds **disjoint date ranges**, so the identity question is
never asked.

### The second finding

The same Chase snapshot legitimately backfilled `CVS $22.84` on 2026-08-18 — a real charge in
a coverage hole (the Chase CSV ends 2026-08-10, SimpleFIN's last Chase transaction is
2026-08-14). It was auto-filed into the **CVS ExtraCare** envelope by that bill's payee claim,
silently spending a balanced envelope $22.84 over, with no uncategorized warning to show for
it. The prior state is on record in `Budget_August_2026 (1).csv` (Aug 28 21:34):
`Uncategorized activity, $0.00`and`CVS ExtraCare, $5.00, -$5.00, $0.00`. A merchant that is
both a $5/month subscription and an occasional shopping trip breaks the assumption that a
claim covers everything the merchant charges.

## Decisions

### D1 — The feed watermark divides ownership

Per account, the **feed watermark** is the latest posted date held by any non-browser feed
(`api:simplefin`, `csv:*`) for that account. That feed owns everything at or before it; the
browser snapshot owns everything after it, up to the capture instant. An account with no feed
rows has no watermark and the snapshot owns everything, as today.

### D2 — A snapshot inserts only past the watermark

Reconciliation drops incoming posted rows whose posted date is at or before the watermark:
they are the other feed's to supply. The receipt reports the count ("N already covered by
SimpleFIN"). The cross-source description path on the posted side is deleted, not improved.

Accepted trade-off: if SimpleFIN delivers part of a day and the rest on a later sync, the
remainder is skipped until that sync supplies it. A briefly missing row shows up in the
Dashboard's balance comparison against the bank's own current balance; a double-counted row
does not show up anywhere.

### D3 — A sync retires the tail it has caught up to

When a SimpleFIN sync or a CSV/statement import advances the watermark, every `scrape:*` row
for that account at or before the new watermark is deleted in the same transaction — the
authoritative feed now covers that period. The handover is explicit rather than an accumulation
of near-duplicates nobody asked for.

### D4 — User-owned state crosses the handover

Before a retired scrape row is deleted, its user-owned fields — envelope, notes, flow override,
exclude-from-baseline, event label, and a split where it transfers without changing meaning —
move to the row replacing it, matched within the account by amount and nearest date.

This matching is a **convenience, not an identity decision**, and that distinction is the point:
a miss costs a category, which then surfaces in the uncategorized count, and never produces a
duplicate. Every miss is a warning in the receipt and in the audit event.

### D5 — A bill's claim files only that bill's own charge

A payee claimed by a **bill** envelope files a new transaction there only when the charge
matches the bill: within tolerance of `expectedCents` (or the median of charges on file when
null), and not a second charge inside one cadence period. Anything else falls through to the
payee's own default, or stays uncategorized so the uncategorized-activity warning does its job.
`CVS $22.84` stops landing in the $5.00/month CVS ExtraCare envelope; Rent and Rent Reporting
keep filing exactly as they do.

### D6 — The register shows where a row came from

A **Source** column on the register grid, rendered from `external_source` through the existing
`FEED_LABELS`, sortable/filterable/groupable like every other column. Provenance questions are
recurring here; answering one should not require a database query.

### D7 — Chase captures no bank category

Chase's activity table has no category column. The script currently reads the description cell
twice and stores `"CVSCVS"` and `"Amazon.comAmazon.com"` in `sourceCategory`; it writes an
empty category instead. Capital One's real categories ("Dining", "Merchandise") are unaffected.

### D8 — Chase's period selector is a completeness assertion

The Chase activity page has a dropdown whose "Activity since last statement" selection is what
makes the captured set complete for the current cycle. The script reads it and fails closed
unless it says so, the same way Capital One's capture depends on the
"Posted Transactions Since Your Last Statement" table heading. A capture taken under any other
selection is incomplete data and must be refused rather than applied.

## Acceptance criteria (met)

- [x] A Capital One snapshot pasted while SimpleFIN already covers the cycle inserts only rows
      past the watermark, and inserts zero duplicates of the seven known cases.
- [x] A SimpleFIN sync that advances the watermark deletes the scrape rows it now covers, and
      the envelope, notes and split on each survive onto the replacing row.
- [x] A handover covering the same transactions leaves working balance and Ready to Assign
      unchanged — the register's row count drops, the money does not move.
- [x] A second identical paste is still a no-op, with its audit event.
- [x] `CVS $22.84` against a claimed bill payee lands uncategorized; a $5.00 CVS ExtraCare
      charge still files automatically; Rent and Rent Reporting are unaffected.
- [x] The register's Source column shows SimpleFIN / Capital One browser / Chase browser / the
      CSV feeds, and filters and groups by them.
- [x] Chase snapshot rows store an empty `sourceCategory`, and a capture taken with the Chase
      period selector on anything but "Activity since last statement" is refused.
- [x] Cross-user isolation holds for every new mutation; unit, integration, lint, typecheck,
      build and `npm run smoke` all pass.

## Changes from original plan

| #   | Change                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **`liveFeedMatch.ts`'s `descriptionsOverlap` and its brand stem are kept, not deleted.** Task 2 said to remove the brand-stem matching "if nothing else still needs it". Something does.                | The posted-vs-**posted-history** comparison D2 supersedes is gone. What remains in `bankSnapshotReconcile.ts` is the pending path: an incoming posted row absorbing an existing _hold_, browser or SimpleFIN, inside the current cycle. That is the within-cycle matching the 36-hour browser-authority window was built on and this spec carries forward; it is also the only place a SimpleFIN hold and a page row can be told apart at all. Deleting the stem there would have re-created duplicate holds while fixing duplicate posted rows. |
| 2   | **A repeat paste is recognised by `externalId`, not by dropping posted matching entirely.** Past the watermark, incoming posted rows are matched against posted history on exact `externalId` equality. | D2 says the description path is deleted, and it is — but "a second identical paste is still a no-op" is an acceptance criterion, and past the watermark the only posted row that can already exist is a previous paste of the same page. The userscripts derive `externalId` from the page row itself (source, card, dates, folded description, amount, occurrence ordinal), so this is an identity within one feed rather than a comparison across two.                                                                                         |
| 3   | **The handover is reported in the sync and import receipts**, not only in the audit event: `SyncCounts.retiredScrapeRows` and a clause in the import summary.                                           | D3 makes the handover explicit rather than silent; a deletion the user is told about after the fact only in the audit log is still surprising when the register's row count drops.                                                                                                                                                                                                                                                                                                                                                               |
| 4   | **The Source column reaches existing users automatically** through `withNewColumns`, landing between Balance and Notes.                                                                                 | No migration or preference reset needed — the grid already distinguishes "hidden" from "did not exist yet".                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | **`categoryForNewTransaction` takes a `claimApplies` flag** rather than growing a bill facet argument.                                                                                                  | The bill decision needs the envelope's amount, cadence and charge history — a database read, not a payee field. Keeping the pure function pure and passing the answer in preserves its unit tests and lets both filing paths (`applyPayeeClaims` and the snapshot's own auto-filing) share one gate, `payees/billClaimGate.ts`.                                                                                                                                                                                                                  |

## Implementation tasks (historical)

Original task text is retained as history; the **Decisions** above and the **Code map**
below are authoritative.

## Task 1: Save spec documentation — done

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`.

## Task 2: Watermark and ownership — done (`feedWatermark.ts`; the brand stem survives on the pending path, change 1)

Add the per-account feed-watermark query beside `src/lib/finances/bankSnapshot*.ts`. Make
`planBankSnapshotReconciliation` take it and drop covered posted rows. Remove the cross-source
description path it replaces — the `descriptionsOverlap` use in `bankSnapshotReconcile.ts`, and
the brand-stem matching added in `1d6d0ce` if nothing else still needs it.

## Task 3: Retirement on sync and import — done (`feedHandover.ts`, `feedHandoverWrite.ts`)

Extend `src/lib/banksync/sync.ts` and `src/lib/finances/import.ts` to retire covered `scrape:*`
rows in the same transaction as the write that advances the watermark, carrying user-owned
state across per D4 and auditing both sides of the handover.

## Task 4: Claim matching — done (`payees/billClaimMatch.ts`, `payees/billClaimGate.ts`)

Narrow `applyPayeeClaims` and `categoryForNewTransaction`
(`src/lib/finances/payees/claims.ts`, `src/lib/finances/payees/autoCategory.ts`) to D5, using
the bill facet on `financeBudgetCategories` (`expectedCents`, `cadenceMonths`/`cadenceDays`).

## Task 5: Register Source column — done

Add it to `src/components/finances/financeColumns.tsx`, labelled through `FEED_LABELS` in
`src/lib/finances/types.ts`.

## Task 6: Chase script, category and period selector — done (userscript v2.2)

`scripts/chase-pending.user.js`: stop writing the doubled description into `category`, and read
the period dropdown, failing closed unless it is "Activity since last statement".

## Task 7: Tests — done (4 new test files, 43 tests)

Pure tests for the watermark split and the bill-claim rule; integration tests for
sync-retirement with state carry-over, each with a second user proving isolation.

## Task 8: Verify, freeze spec, update roadmap — done (live handover verified 2026-08-29)

Real paste on both cards, Budget unchanged, `npm run smoke`, then freeze and update
`agent-os/product/roadmap.md` if this closes a listed item.

---

## Code map (as built)

| Concern                                                  | File                                                                               |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Watermark: whose day is it, and the per-account query    | `src/lib/finances/feedWatermark.ts`                                                |
| Snapshot reconciliation, now watermark-first             | `src/lib/finances/bankSnapshotReconcile.ts`                                        |
| Handover planning — matching, carry-over, split transfer | `src/lib/finances/feedHandover.ts`                                                 |
| Handover writes, called inside the caller's transaction  | `src/lib/finances/feedHandoverWrite.ts`                                            |
| Retirement on sync                                       | `src/lib/banksync/mutations.ts` (`applySync`)                                      |
| Retirement on file import                                | `src/lib/finances/import.ts`                                                       |
| Bill-claim rule (pure)                                   | `src/lib/finances/payees/billClaimMatch.ts`                                        |
| Bill-claim gate shared by both filing paths              | `src/lib/finances/payees/billClaimGate.ts`                                         |
| Claim filing and fall-through to the payee default       | `src/lib/finances/payees/claims.ts`, `payees/autoCategory.ts`                      |
| Register Source column                                   | `src/components/finances/financeColumns.tsx`, `src/lib/finances/registerFields.ts` |
| Chase capture                                            | `scripts/chase-pending.user.js` (v2.2)                                             |

## Status (closed)

**Shipped** 2026-08-29, commits `d728ac7`…`d19c7ad`.

Verified live on the real wallet the same day: a SimpleFIN refresh replaced the rows the
userscripts had written, with **no duplicates**, and re-running both userscripts afterwards
changed nothing — the watermark now covers what they capture. That is D1, D2 and D3 observed
on real data rather than only in tests.

The remaining decisions are covered by the suite rather than by that session: D4's carry-over
and split transfer, D5's bill-claim rule, D6's Source column, and D7/D8 in the Chase script.
D5 in particular has not yet met a live `CVS $22.84` — the next one it sees should land
uncategorized rather than in CVS ExtraCare.

| Task             | Outcome                                                           |
| ---------------- | ----------------------------------------------------------------- |
| 1 Spec docs      | This folder                                                       |
| 2 Watermark      | `feedWatermark.ts`; posted-vs-posted description matching removed |
| 3 Handover       | Retirement inside the sync's and the import's own transaction     |
| 4 Claim matching | Bill claims file only the bill's own charge; others unchanged     |
| 5 Source column  | Register column, reaching existing layouts via `withNewColumns`   |
| 6 Chase script   | Empty `sourceCategory`; fails closed on the period selector       |
| 7 Tests          | 43 tests across 4 files, including cross-user isolation           |
| 8 Verify         | Live handover confirmed; spec frozen                              |

### Follow-ups (new work — not amendments to this frozen spec)

- **Checking-account browser capture.** Still out of scope; the watermark model would apply
  to it unchanged, which is a point in the model's favour rather than a plan.
- **A dashboard reading of the watermark itself** — "SimpleFIN covers this card through
  Aug 24" — would make the handover legible before it happens rather than after.
- **`liveFeedMatch.ts` now has one caller class fewer than its docstring describes.** Worth a
  documentation pass so the next reader does not think the brand stem is still on the posted
  path.
- **The bill-claim gate reads every charge in a bill envelope** to compute its median and
  cadence guard. Fine at this register's size; a bill with years of history would want the
  query bounded.
- **A refused bill claim is silent to the user** beyond the row staying uncategorized. If the
  backlog count turns out not to be a loud enough signal, the Review page is where to say
  "this charge did not match its bill."

---

**This spec is frozen.** Reference it for what feed ownership means and why; open a new
delta-spec to change it.
