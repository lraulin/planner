# A bill's expected charge follows its charges

**Status: frozen / complete** (2026-09-06)
Spec folder: `agent-os/specs/2026-09-06-1427-bill-anchor-retires/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-25-0901-bill-next-charge/` **D4** — both halves of
  it. Its basis ("last charge through the **payee claim**, not the transaction's
  `budget_category_id`") is reversed by D3 here, and its write rule ("reject dates on or
  before the last posted charge") is widened by D2. What survives is D4's _purpose_, which
  this spec keeps intact: a stored Next charge must never be one `billAnchor` will ignore.
  D1, D2, D3 and D5 of that spec are untouched.
- **Supersedes:** `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/` — the
  **diagnosis** recorded in its D4 and its Changes-from-plan row 3, not any of its decisions.
  It concluded the stale Dropbox anchor was `lastChargeByEnvelope` failing to see a
  hand-categorised charge. It was not: the charge was seen. See **Context**. Its D1–D3 and
  every acceptance criterion stand.
- **Extends:** `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/` — **D1**'s
  nearest-occurrence rule, which this applies to the _undeclared_ branch `billAnchor` left on
  a walk, and **D2**, which is the reason the undeclared branch stays a walk rather than
  growing a series of its own.
- **Extends:** `agent-os/specs/2026-08-26-2022-split-transactions/` **D2/D3** — routing by
  `budget_category_id` has to declare which row set it means. Leaves (`moneyRows`); a split
  parent holds no envelope, so this is a declaration, not a filter.
- **Extends:** `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/` **D5** —
  `billClaimAccepts`'s amount band. D3 explains, with the data, why the anchor must **not**
  reuse it, and D5 here fixes the staleness that makes that band misfire.
- **Extends:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` — "propose, never
  apply", the founding rule every declaration in this area follows. D5 is a new proposal, not
  a new automatic write.
- **Extends:** `agent-os/specs/2026-08-21-1122-commitments-curation/` **D7** — "an
  `anchorDate` later than the last posted charge **is** the charge being waited for". That
  sentence is what D1 corrects: later is not the same as still ahead.

Checked and unaffected: `2026-09-03-0951-cancelled-bill-handling` (cancelled bills keep their
stored anchor and grow no next-due key; the retirement predicate never runs for them),
`2026-08-23-2313-one-budget` D2 (no stored cursor, occurrences stay derived — still true),
`2026-08-28-1000-ynab-target-engine` D5 (the derived bill target reads `expectedKey` through
`ScheduleBill` and inherits the correction without change).

## Context

`agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/` shipped with a follow-up:

> **The stale bill anchor** (D4, confirmed). `lastChargeByEnvelope` advances `expectedKey`
> only through a claimed payee, so a charge categorised by hand leaves the Bills page showing
> a next-charge date that has already passed. Display-only.

**That diagnosis is wrong for the bill it was written about.** Replaying `billAnchor` over all
33 live bill envelopes (production, read-only, `todayKey = 2026-09-06`) says why:

```
Dropbox   anchor_date  2026-09-06     (2025-09-06 + 12 months)
          last charge  2026-09-05     seen fine — the DROPBOX payee IS claimed
          billAnchor:  anchorDate > lastCharge  →  expectedKey = 2026-09-06
```

The payee claim saw the charge. What failed is that **a stored prediction never retires**. A
charge that posts even one day before the date predicted for it leaves that prediction
standing forever, because the anchor branch asks only "is the anchor later than the last
charge?" — and later is not the same as still ahead. Two bills are wrong today, and both are
this:

| bill    | anchor       | last charge  | shows        | should be    |
| ------- | ------------ | ------------ | ------------ | ------------ |
| Dropbox | `2026-09-06` | `2026-09-05` | `2026-09-06` | `2027-09-05` |
| Rent    | `2026-09-05` | `2026-08-26` | `2026-09-05` | `2026-09-26` |

This is the error `bill-due-dates-and-lead-time` already diagnosed — _"a walk absorbs every
deviation permanently instead of correcting"_ — and fixed for the **declared** branch only,
with nearest-occurrence matching (its D1). The undeclared branch never got the same
treatment, and every bill in this file is undeclared: **no bill has a `due_day`**.

### The claim-blindness is separately real, and latent

Eight bills have a phantom payee that exists only to hold a claim, with **zero transactions on
it**:

| bill                                                    | claim payee               | where the charges are                 |
| ------------------------------------------------------- | ------------------------- | ------------------------------------- |
| iCloud+, Paste, Sky Tonight, Robokiller, Carrot Weather | one each, 0 tx            | `Apple/bill` — 290 tx, claims nothing |
| Phone (Mint Mobile)                                     | `Phone (Mint Mobile)`     | `Mint Mobile`                         |
| Huel                                                    | `Huel $95.40`             | `HUEL`                                |
| Amazon Prime Membership                                 | `Amazon Prime Membership` | `Amazon Prime`                        |

`claimed_budget_category_id` is one payee → one envelope, and `Apple/bill` legitimately feeds
five bills. The shape cannot be expressed, so it was worked around with phantom payees.
`lastChargeByEnvelope` returns null for all eight, so their expected dates cannot move at all.
There is no symptom today only because their stored anchors are still in the future —
**Paste's is 2026-09-07** — and the charge that pays it will arrive on `Apple/bill` and be
invisible.

Two workarounds for one missing concept: the model-correction signal in
`agent-os/standards/development/clean-code.md`. The missing concept is small. **A bill's
charges are the transactions filed to its envelope.** A payee claim is a _routing rule_ for
getting them filed; it is not the definition of what a charge is.

## Decisions

### D1 — A prediction is retired by the charge that pays it

An anchor is one predicted posting. The last charge pays it when it sits nearer to the anchor
than to the neighbouring occurrence:

```
anchorPaid = |lastCharge − anchorDate| < cadenceDaysApprox(cadence) / 2
```

The same "nearest, not the next one after" rule `billSchedule.nearestOccurrence` uses for
declared bills, for the same reason it gives: _a charge four days early is that occurrence's
charge, and calling it the previous one's late payment is exactly the error the walk made._
Half a cadence rather than a tuned constant, because the cadence already defines the buckets —
there is nothing to get wrong.

Retired, the bill walks from its charges, which is what it already does for an anchor in the
past. Verified over all 33 live bills: exactly Dropbox and Rent change. Chewy (27 days from a
monthly anchor), Claude (31) and GRAY MIRROR (31) keep their anchors, as does every other
future one.

**Not** re-seeded into a series phased on the anchor. That over-trusts a date nobody verified:
seeding Rent's series on its stale `2026-09-05` gives `2026-10-05`, which is worse than the
walk's `2026-09-26`. `bill-due-dates-and-lead-time` D2 settled this — an undeclared bill _is_
a walk, and the real fix for a calendar bill is to declare its due day.

### D2 — The write guard shares the predicate

`nextChargeWriteError` exists so a stored date cannot be one `billAnchor` will ignore —
_"storing such a date would look like the save bounced."_ Widening the reader without widening
the guard recreates precisely that symptom: type `2026-09-06` into Dropbox's Next charge, watch
it save, watch the grid replace it with `2027-09-05`.

So both call one exported predicate, and the message names the charge that covers the date:
_"The charge on 2026-09-05 already covers that date."_

This reverses the assertion in `mutations.integration.test.ts:647` — a Next charge nine days
after a semi-annual bill's posted charge is now refused. That refusal is correct on its own
terms (there cannot be two Geico charges nine days apart), and it is recorded here rather than
patched quietly.

### D3 — A bill's charges are what is filed to its envelope

`lastChargeByEnvelope` and `lastChargeOnBill` drop the payee join and group
`finance_transactions` by `budget_category_id`, keeping the Amazon-receipt union unchanged.
Two guards, both discovered in the data rather than reasoned from first principles:

- **Leaf rows only** (`moneyRows`, `split-transactions` D2). A split parent holds no envelope
  (that spec's D3), so this is a declaration of which row set is meant rather than a filter
  that changes the answer — which is exactly why it has to be written at the call site.
- **Outflows only.** The Comcast envelope holds `+$0.10` and `+$1.20` credits. A refund is not
  the charge a bill is waiting for.

**No amount gate.** Reusing `billClaimAccepts`'s 7.5% band is the obvious move and the data
refuses it: it would reject the _most recent real charge_ on SimpliSafe (5 of 5 recent),
Spotify (6 of 8), YouTube (4), SMECO (7), Mint Mobile (6), Trash (4) and Geico (3) — leaving
those bills blinder than they are today. What a charge is worth is D5's problem; it is not the
anchor's.

This supersedes `bill-next-charge` D4's basis. Its concern — a $12 CVS row hand-filed onto the
Geico envelope must not move Geico's date — survives in a better form: under D1 that row sits
nowhere near Geico's anchor, so it retires nothing and Geico keeps expecting December.

### D4 — One route, followed everywhere it is read

`loadDashboard` and `loadBillForecast` route bank rows to bills through `payeeClaimIndex` as
well — the Bills page's 12-month projection, the inspector's charge series, and the dashboard.
Left alone, they would disagree with the grid directly above them on the same page, which is
the failure the `payeeClaimIndex` call site's own comment warns about (_"the only route from a
bank string to a bill envelope. Resolving per panel is how a merchant ends up folded into a
bill on one surface and not another."_). They already select `budgetCategoryId`, so each is a
one-line change at the routing site, not a new query.

### D5 — A bill whose charges outgrew its declared amount says so

`expected_cents` is stale on seven bills. SimpliSafe declares $31.79 and has charged $34.97 for
five straight months; Geico declares $700.04 against $594.98; Mint Mobile $165.94 against
$100.62. That staleness is what makes `billClaimAccepts` refuse to auto-file those charges,
which is what produced the phantom claim payees in the first place — so it is the same defect
seen from the other end.

A new panel beside "Still active? · dates to review": **"Amount changed? · N bills"**, each row
offering the observed figure as a one-click set. **Propose, never apply** — the same shape as
`suggestLeadDays` and the cadence detector.

The discriminator is **agreement, not distance**: propose only when the last three charges
agree with each other (`observedAmountRange` returns null — spread ≤ 25%) _and_ their median
sits outside the declared amount's `approxThreshold` band. SimpliSafe, Spotify, YouTube, Trash,
Geico and Mint Mobile propose; a genuinely variable bill whose charges disagree with each other
does not.

## Acceptance criteria

- [x] **Dropbox** — anchor `2026-09-06`, charge `2026-09-05` — Next charge **2027-09-05**.
      Replay of production rows through `billAnchor` on 2026-09-06.
- [x] Dropbox's rolled expected key is the same state `pile-spent-is-not-a-raid` D2 already
      verified: Fully Spent at $0 Available, ask $63.54 → $4.89, no false extra pill. Not
      re-walked on the deployed Budget page in this session; the date is the only input that
      changed.
- [x] **Rent** reads **2026-09-26**, not `2026-09-05`.
- [x] Every other live bill's Next charge is identical. Pinned by
      `commitments.test.ts` replaying the 33 production pairs.
- [x] **Paste** last charge is `2026-08-09` (was invisible through the phantom claim). Next
      charge stays **2026-09-07**: 29 days is more than half a monthly cadence, so D1 does
      not retire the stored date. Same shape for the other seven claim-blind bills — last
      charge is now visible, expected date unchanged.
- [x] A `+$1.20` credit is not a charge, and neither is a split parent.
- [x] A $12 CVS row hand-filed onto the semi-annual Geico envelope does **not** retire a
      December anchor.
- [x] Typing `2026-09-06` into Dropbox's Next charge is refused with "The charge on
      2026-09-05 already covers that date."; a date a full cadence out is stored.
- [x] The Bills page's 12-month projection and the dashboard route by envelope, same as the
      grid.
- [x] **SimpliSafe** is offered $34.97 against $31.79. As of 2026-09-06 the panel also lists
      Geico, SMECO, Mint Mobile, Spotify, Trash and YouTube — SMECO's last three currently
      agree, so it is in. A synthetic disagreement still does not appear. Nothing is applied
      without the click (`ctx.patch` → existing `expectedCents` write).
- [x] A second user cannot read the first user's last charge or patch the first user's bill.
- [x] `npm run lint`, `npm run typecheck`, `npm test` (4002 unit + 1021 integration, Postgres
      up, no skip), `npm run build` (isolated worktree), `npm run smoke` (62 routes including
      `/finances/bills`).

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                            | Why                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Paste's Next charge stays `2026-09-07`; last charge becomes `2026-08-09`.                         | Half a cadence does not retire a charge 29 days early. The AC's "walks from it" was the last-charge column becoming visible, not the stored prediction being discarded.             |
| 2   | "Amount changed?" on 2026-09-06 also lists SMECO. Geico's offered figure is $587.85, not $594.98. | The discriminator is the last three charges. SMECO's last three currently agree (spread ≤ 25%) even though the longer series is variable. Geico's median of those three is $587.85. |
| 3   | Write-guard copy is one sentence: "The charge on DATE already covers that date."                  | Covers both on-or-before and the new half-cadence case.                                                                                                                             |

> **While this spec is active:** a material change to requirements, design or scope —
> including feedback on what was actually built — updates the sections above and appends a row
> here. Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md` and `references.md`. No
`visuals/` — this is date arithmetic and none were provided. Commit and push.
**Shaping ends here**; implementation starts in a fresh session at Task 2.

## Task 2: The predicate

`commitments.ts`, beside `billAnchor`: export the D1 predicate — whether a posted charge covers
an anchor date, given the cadence. `billAnchor`'s anchor branch and `nextChargeWriteError` (D2)
both call it, and `nextChargeWriteError`'s message names the covering charge.

Correct the `BillAnchor` doc comment while there: the rule it states — _"an anchor later than
the last posted charge is the charge being waited for"_ — is the sentence this task falsifies.

Tests in `commitments.test.ts`, named for the claim they defend:

- _"a charge that posted a day early retires the date predicted for it"_ — Dropbox, the
  reported bug.
- _"a charge a month before a monthly anchor does not"_ — Claude and Chewy: the guard on the
  blast radius, and the reason the boundary is half a cadence rather than a constant.
- _"a stray charge nowhere near the anchor retires nothing"_ — the CVS/Geico case D3 inherits
  from `bill-next-charge` D4.
- _"a bill with no anchor still walks"_ — unchanged, asserted as equality against the
  undeclared answer rather than against copied literals, the technique `commitments.test.ts`
  already uses.
- A replay case built from the 33 production anchor/charge pairs, asserting only Dropbox and
  Rent move. Capture that before-table first; it is also what Task 6 verifies against.

## Task 3: The basis

`billLastCharge.ts`: D3. Group by `budget_category_id`, leaves only (`moneyRows`), outflows
only, receipts union kept. Rewrite the module header — the load-bearing claim is no longer
"joined through the payee claim" but **a bill's charges are what is filed to its envelope; the
claim is how they get there**.

`dashboardQueries.ts`: D4, at both routing sites (`loadBillForecast`, `loadDashboard`), and the
`payeeClaimIndex` comment that currently calls itself the only route from a bank string to a
bill envelope.

`mutations.integration.test.ts`: replace `:647` (_"does not treat a recategorised charge as the
last posted charge"_) with the two cases that reverse it — a hand-filed charge **is** this
bill's charge, and a hand-filed row of the wrong shape still cannot retire a distant anchor.
Cross-user case on the new query, per `standards/development/testing.md`.

## Task 4: The amount nudge

`commitments.ts`: `billsNeedingAmountReview`, beside `billsNeedingReview` — pure, taking bills
and their charge series. Reuses `observedAmountRange` (`commitmentRows.ts`) and
`approxThreshold` (`amountMatch.ts`); `medianCents` moves out of `billClaimMatch.ts` to
somewhere both can see it. Tests: SimpliSafe proposes, a SMECO-shaped disagreement does not, a
bill declaring no amount does not.

`BillsView.tsx`: the panel, mirroring the review panel's markup and its "asks for review; does
not prove anything" register. The set button goes through the existing `ctx.patch` →
`onPatchBill({ expectedCents })` — no new action, no new mutation.

## Task 5: Full gate

`npm run lint`, `npm run typecheck`, `npm test` (Postgres up — this touches `queries.ts` and
`mutations.ts`, so check for the skip warning rather than assuming), `npm run build`,
`npm run smoke`. The Bills page changes, so smoke is not optional here.

## Task 6: Verify on the deployed app, freeze spec

The development database is a seed; these numbers exist only in production, so the walk is on
the deployed app (`lee-validates-on-the-deployed-iphone` — push to `master` first).

- `/finances/bills`: Dropbox **2027-09-05**, Rent **2026-09-26**, Paste walking from
  `2026-08-09`, and every other row unchanged against the before-table captured in Task 2.
- The "dates to review" list, before and after.
- "Amount changed?" lists SimpliSafe, Spotify, YouTube, Trash, Geico and Mint Mobile; set
  SimpliSafe to $34.97 and confirm it persists and leaves the list.
- `/finances/budget`, September 2026: Dropbox still **Fully Spent**, ask $4.89, no "extra"
  pill; the header's "still needed" total before and after.

Then align this file with as-built reality, complete **Changes from original plan**, mark
`plan.md` and `shape.md` **frozen / complete**, and add the roadmap entry the bills work is
missing — `bill-due-dates-and-lead-time` shipped without one, so one entry can cover both.

**Flagged, not changed:** Rent's `due_day` / `lead_days` are null in production although
`bill-due-dates-and-lead-time`'s acceptance criteria say it was set to due day 1 / lead 7. This
spec gets Rent to `2026-09-26` by the walk; declaring the due day would make it `2026-09-24`
and self-correcting. Whether the declaration was never saved or was later cleared is unknown
and is its own question.

## Follow-ups (new work — not amendments to this frozen spec)

- **A one-time savings goal** — carried forward from `pile-spent-is-not-a-raid`.
- **A payee that feeds more than one bill.** D3 made the eight phantom claim payees
  harmless; retiring them is a schema question.
- **Rent's `due_day` / `lead_days`** are still null in production. This spec gets Rent to
  `2026-09-26` by the walk; declaring due day 1 / lead 7 would make it `2026-09-24` and
  self-correcting.
- **Set SimpliSafe to $34.97 on the deployed Bills page** and confirm it leaves
  "Amount changed?". The write path is the existing patch; the click itself is the iPhone
  walk.

## Out of scope

- **A one-time savings goal** — carried forward untouched from `pile-spent-is-not-a-raid`'s
  follow-ups.
- **A payee that feeds more than one bill.** `Apple/bill` has 290 transactions and claims
  nothing, because a claim is one payee → one envelope. D3 makes the eight phantom claim payees
  _harmless_ rather than gone; retiring them properly is a schema question.
- Schema changes. Nothing here adds a column or a table.
