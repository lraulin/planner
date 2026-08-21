# Commitments — categories, aliases, and real cadences

**Status: frozen / complete** (2026-08-21)
Spec folder: `agent-os/specs/2026-08-21-1122-commitments-curation/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-16-1938-commitments/` — the two-tier model (D0), the
  name/matcher split (D2), cross-table matcher exclusivity (D3), propose-never-apply (D8),
  and the one-page/two-section layout (D10).
- **Extends:** `agent-os/specs/2026-08-18-2058-commitments-clarity/` — Review proposes and you
  name it before it commits (D3), Dismissed lives under Review (D4).
- **Supersedes:** `agent-os/specs/2026-08-18-2058-commitments-clarity/` — **D5 only**, which
  deferred joining an existing group to "when it actually bites". It bit: the same bill appears
  in Review under two vendor spellings and there is no way to say so from the bills tier.
- **Supersedes:** `agent-os/specs/2026-08-16-1938-commitments/` — its **cadence-in-months
  decision** (recorded on `financeRecurringBills.cadenceMonths`), for the narrow case of a
  charge that recurs on a **day** interval. Months stay the default and stay right for rent,
  insurance, and every calendar-anchored bill; see D3.

## Context

Commitments computes correctly and curates badly. Six weeks of real use surfaced five separate
failures, and four of them are the same failure: **the app can only describe a commitment in
the vocabulary its detector happens to speak.**

Measured against the live database on 2026-08-21:

| Symptom                                  | What the data says                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Walmart never reaches Review             | 30+ weekly charges on file, correctly folded to one merchant by `rules.ts:91`. `recurringMerchants` drops it because the amounts run **$10.56 to $347.86** — a 37% deviation against a 25% cap   |
| Vetsource looks monthly                  | Gaps `30, 28, 28, 31, 30, 28, 28, 28, 28, 29`; day-of-month walks **30 → 29 → 27 → 24 → 24 → 26 → 23 → 21 → 18 → 16 → 14**. It is a 28-day autoship, and "monthly" costs it 13.04 charges a year |
| "Next charge" is empty in the bill draft | `ReviewList.tsx:293` — `useState("")`. The last charge and the cadence are both in hand one line above                                                                                           |
| Same bill, two vendor spellings          | No way to fold one into the other on the bills tier. The clarity spec's D5 deferred exactly this                                                                                                 |
| No category on a commitment              | Vetsource is `Uncategorized`. The taxonomy exists (`classify/categories.ts`) and commitments cannot reach it                                                                                     |

The through-line: `recurringMerchants` was built to assert a subscription unprompted, so it
demands **regularity in amount and in date at once**. That is right for a thing that charges
you automatically and wrong for everything in tier 2, where the amount is _supposed_ to swing —
"the amount fuzzy and derived from history" is the tier's own definition
(`commitments.ts:8`). One detector was doing two jobs, the same shape of mistake the
`merchant` column made before D2 split it.

Two smaller items ride along because they are on the same screen: the URL column becomes a
link you can actually click, and Review moves to the bottom of the page — it is an inbox, and
an inbox you have worked through does not belong above the thing it fills.

## Decisions

**D1 — A second detector for tier 2, keyed on _presence per period_, not on gap regularity.**
`spendCandidates()` ignores amount entirely and asks one question: in what share of the periods
it spans does this merchant charge at all? Walmart hits **21 of the last 26 weeks (81%)** —
while its _gaps_ are 7, 7, 9, 2, 5, 11, 1… because mid-week trips happen. A gap-consistency
test fails on that data; a coverage test is what actually describes "we go on Sundays". It is
also the same question `recurringSpendRate` already answers when it takes a median of
per-period totals, so the detector and the rate measure the same buckets via the same
`periodIndex`.

Threshold: **≥ 75% coverage over ≥ 8 periods**, week tried before month. On the live data that
yields Walmart, CVS, Pizza Hut, Sheetz, Chipotle, Apple — a short list of real answers, not a
flood. `recurringMerchants` is untouched: the bills-shaped list must not start guessing.

**D2 — Review is one list with a `shape` on each row.** A candidate arrives marked `bill`
(regular in amount _and_ date) or `spend` (regular in date only), which orders the two buttons
and picks the default draft. Both buttons stay on both shapes — the shape is a suggestion, and
the user is the one who knows Sheetz is petrol and not a subscription. Two separate lists would
put the same decision in two places and make "is this a bill?" the app's opinion rather than a
question it is asking.

**D3 — Cadence becomes months _or_ days, and detection chooses by day-of-month drift.**
`Cadence = { unit: "month" | "day"; n: number }`. A 28-day autoship is not "monthly": twelve
months a year against 13.04 cycles understates Vetsource by ~$31/yr and slips the predicted
date ~2 days every cycle, cumulatively.

The discriminator is free and exact: **a monthly bill holds its day of the month; a day-cycle
walks it backward.** Rent posts on the 1st with gaps of 28–31 and stays monthly; Vetsource has
the same gaps and a day-of-month that marches, so it is `{ day: 28 }`. Weeks were considered
and rejected as the unit — Vetsource slips (30, 31, 29 among the 28s), so promising a weekday
would be a promise the data does not keep. Days are what the vendor is actually counting.

`cadenceMonths` stays `not null` and keeps its CHECK; `cadenceDays` is nullable and wins when
set. Every cadence function moves to the `Cadence` value rather than a bare number, because the
alternative — a `cadenceDays ?? cadenceMonths` conditional at each of the ~15 call sites — is
the business rule written fifteen times.

**D4 — Categories reach the transactions, and rank below a per-row override.** Precedence
becomes: the user's `category` on the row > **the commitment's category** > a `rules.ts` match >
the bank's label. A commitment category is a user-level fact stated once about a merchant
group, so it must outrank a pattern guess; it must lose to an explicit edit of one row, which
is a statement about _that_ charge.

It lands through the existing machinery: `categorize()` takes the matcher→category map,
`planReclassify` threads it, and saving a commitment category runs `reclassifyTransactions`,
which already diffs with `changedRows` and writes nothing when nothing moved. Both tiers carry
it — groceries and pizza are exactly the rows most worth categorising, and a category that
worked on one tier only would be a rule nobody could remember.

**D5 — Adding an alias to an existing bill warns when the two series overlap, and never
blocks.** A vendor rename produces a **clean series**: sort the merged charges and consecutive
ones sit about one cadence apart. Two concurrent bills produce a **short gap between charges
from different aliases**. So the check is one pure function over the merged, sorted history —
flag any gap under 60% of a cadence whose two charges come from different aliases — and it
works identically for month and day cadences without needing a calendar-month bucket.

The warning names the dates. It sits above the commit button and the button still commits,
because this codebase proposes and never applies (frozen spec D8), and because a vendor can
genuinely double-charge in the month it migrates billing systems.

Spend groups get **no** such warning. That is the frozen spec's D4 — two pizzas in one week is
a higher rate, not an error — and it is still right.

**D6 — The URL column is a link with an explicit edit mode.** One click cannot both follow a
link and focus an input, so the modes are separated: read mode shows the hostname as a real
link (`target="_blank" rel="noopener noreferrer"`), and a pencil — dim until row hover, always
in the tab order, with a `title` per `components/ux-principles` — swaps in the input. Enter or
blur commits, Escape reverts. Empty renders as an `Add link` affordance rather than an empty
box, because an empty borderless input in a dense grid is invisible.

Renamed to **URL** end to end, `cancel_url` column included. It is as often the account page as
the cancellation page, and a column named `cancel_url` holding a login URL is a comment that
has gone stale in the schema.

**D7 — "Next charge" means the next charge, in both modules that read it.** The draft prefills
`nextDueFrom(lastChargeOn, cadence, today)`, and recomputes when the cadence dropdown moves
until the user edits the field.

That exposes a real inconsistency in what `anchorDate` means. `commitmentRows.ts:101` treats an
anchor later than the last posted charge as _the next charge_; `available.ts:474` treats the
same column as _the period start_ — an anchor in the future would invert the accrual window.
Both readings are defensible and one column cannot hold both, so a single
`billAnchor(bill, lastCharge, todayKey) → { periodStartKey, nextDueKey }` in `commitments.ts`
becomes the only place the question is answered.

**D8 — Review moves to the foot of the page.** Order becomes Subscriptions & bills → Recurring
spend → Review. Review is an inbox: heavily used while the list is being built, rarely after.
The two grids are the standing reference and belong above it. Copy that says "from Review
above" changes with it.

## Acceptance criteria

Verified 2026-08-21 against the live database and a full gate run (lint, typecheck, 2,971 unit

- 788 integration tests with Postgres up, `next build`, `npm run smoke` across all 57 routes),
  plus a browser pass over `/finances/commitments`.

* [x] Walmart appears in Review marked as recurring-spend-shaped, showing a weekly rate and the
      range its charges span. Live: **81% of weeks, $194.54 typical, $7.46–$868.62 a visit,
      $10,150.61 a year**, top of the list, with "Track as spend" as the leading button
* [x] Vetsource can be declared **every 28 days**. `detectCadence` returns `{ day: 28 }` from its
      eleven real charge dates; a year of it costs **$387.42** rather than the $356.40 twelve
      months would price, and the next charge lands 2026-09-11 rather than 09-14
* [x] Detection proposes `every 28 days` for Vetsource and `monthly` for Rent, from the same
      28–31 day gaps, on day-of-month drift alone. Both pinned in `recurringBills.test.ts`
* [x] "Track as bill" opens with Next charge already filled from the last charge plus the
      cadence, and it follows the cadence dropdown until edited. Walked in the browser: ALDI
      opened at 08/25/2026
* [x] A second vendor spelling can be added to an existing bill from Review, with a dated
      warning when the two charged inside the same cycle — and the commit button stays live.
      Walked in the browser: joining ALDI to Rent warns **"charged inside the same cycle 18
      times (8/19/2024 + 8/26/2024, 8/25/2024 + 8/26/2024, and earlier)"**
* [x] A clean handoff shows **no** warning. Checked against the two real renames in the file:
      `METLIFE` → `METLIFE PET` (10 + 12 charges) and `ATHLETICGREENSWWW…` →
      `ATHLETICGREENSHTTPS…` (28 + 6) both report **0 overlaps**, while the two concurrent
      Walmart spellings report **60**
* [x] Both tiers carry a category from `FINANCE_CATEGORIES`, and it recategorises the charges it
      matches while losing to a per-row override. Pinned in `categorize.test.ts` and
      `reclassify.integration.test.ts`
* [x] The URL cell renders a clickable hostname opening in a new tab, is editable from a
      keyboard-reachable pencil, and is labelled **URL** everywhere including the column.
      Walked in the browser end to end — `geico.com` rendered as a link, then cleared
* [x] Review is the last section on `/finances/commitments`
* [x] A second user cannot read, change or delete the first user's commitments through any new
      mutation, action, or agent tool, including `add_commitment_matchers`
* [x] `lint`, `typecheck`, `test:unit`, `test:integration` (no skip warning), `next build`, and
      `npm run smoke` with the dev server running

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Pure code polish is
omitted.

| #   | Change                                                                 | Why                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The tier-2 detector measures **coverage**, not gap regularity          | The plan's first design was refuted by the data during shaping and the reasoning is recorded in D1. Walmart's gaps are 7, 7, 9, 2, 5, 11, 1 — mid-week trips — so a gap-consistency test rejects it; its weekly _presence_ is 21 of 26                              |
| 2   | `aliasOverlap` pairs each new charge with its **nearest** existing one | The planned merged-series walk reported every adjacent cross pair, so three double-billed months read as five overlaps. Nearest-charge matching reports once per new charge, which is the number a person would count                                               |
| 3   | `snapToWeeks` was designed and then deleted                            | It rounded a 29-day median onto 28. The real Vetsource median is already 28, so it existed for no case in the data — and it would have mis-described a series that genuinely runs on 29 days                                                                        |
| 4   | `DAY_GAP_TOLERANCE` is 3 days, not 2                                   | Vetsource's gaps include a 31 against a median of 28. At two days the one series this branch exists for was rejected                                                                                                                                                |
| 5   | `billAnchor` returns three dates, not two                              | The plan said `{ periodStartKey, nextDueKey }`. `staleSubscriptions` needs the expected date _even when it has passed_ — that is what overdue means — while the editable column needs the one after today. One field could not be both                              |
| 6   | `paydaysPerCadence` takes a `Cadence` and counts in days               | It divided 26 paydays by months. A 28-day cadence has no month to divide, and rounding it to one would have accrued a four-week bill over two paychecks by accident rather than by arithmetic                                                                       |
| 7   | The rename migration was hand-written with a hand-built snapshot       | `db:generate` prompts interactively to disambiguate a column rename and there is no TTY here. The additive columns were generated normally; `0058` renames `cancel_url` → `url` with a snapshot copied and edited, then verified by `db:generate` reporting no diff |
| 8   | Three right-aligned cells gained `min-w-0 overflow-hidden`             | Adding a Category column tightened the grid enough that the Set aside cell overflowed its column and painted across Cadence. The bug pre-existed; the new column is what made it visible                                                                            |
| 9   | The Review scroller grew from `max-h-64` to `max-h-96`                 | With a draft expanded and a warning shown, the commit button sat below the fold of its own scroller                                                                                                                                                                 |
| 10  | `RecurringMerchant.cadenceDays` became `observedGapDays`               | `cadenceDays` is now a stored column meaning a _declared_ day interval. The same name on the observed median gap was a trap for the next reader                                                                                                                     |
| 11  | `RecurringMerchant` carries `chargeKeys`                               | The overlap check runs in the review draft, on a merchant no commitment claims yet — so its charge dates are not in `billCharges` and had to travel with the candidate                                                                                              |

---

## Task 1: Save spec documentation

This folder: `plan.md` (**Status: active**), `shape.md`, `standards.md`, `references.md`.

## Task 2: Schema and migration

`src/db/schema.ts`, then `npm run db:generate` — never hand-write a migration without its
snapshot (`database/migrations`).

- `finance_recurring_bills`: rename `cancel_url` → `url`; add `cadence_days smallint` (null,
  CHECK 2–200 when present); add `category text not null default ''`.
- `finance_recurring_spend`: add `category text not null default ''`.

Every new column carries a comment saying _why_, in the voice of the surrounding schema. The
`cadenceMonths` comment gains the D3 amendment — months stay the default and the reason is
still calendar anchoring; `cadenceDays` exists for a vendor counting days, and says which one
wins.

## Task 3: Cadence as a value

`src/lib/finances/recurringBills.ts` with `recurringBills.test.ts`.

```ts
export type Cadence = { unit: "month" | "day"; n: number };
export function cadenceOf(bill: {
  cadenceMonths: number;
  cadenceDays: number | null;
}): Cadence;
export function cadenceLabel(c: Cadence): string; // "Every 4 weeks", "Every 28 days", "Yearly"
export function nextDueDate(lastChargeOn: string, c: Cadence): string;
export function nextDueFrom(lastChargeOn: string, c: Cadence, todayKey: string): string;
export function spanDays(chargeDateKey: string, c: Cadence): number;
export function annualCents(chargeCents: number, c: Cadence): number; // days → ×365.2425/n
```

Day arithmetic goes through `shiftDateKey` (`schedule/geometry`), never a `Date` —
`development/dates`. Convert every call site rather than keeping a numeric overload:
`analytics.ts`, `available.ts`, `commitments.ts`, `commitmentRows.ts`, `dashboardQueries.ts`,
`insightsAnalysis.ts`, `find/searchable.ts`, the agent tools, and both grids.

Then the detector half, in the same module:

```ts
export function detectCadence(chargeDates: readonly string[]): Cadence | null;
```

Day-of-month stability decides it: stable (within ±2, month-end aware) → the existing
`cadenceMonthsFromGapDays` path; drifting monotonically with tightly clustered gaps → a day
cadence at the median gap, snapped to a multiple of 7 when within a day of one. Tests pin
Vetsource's real eleven dates → `{ day: 28 }` and a 1st-of-month rent → `{ month: 1 }` from
gaps that overlap.

## Task 4: The tier-2 detector

`src/lib/finances/analytics.ts` (+ test). `spendCandidates(rows, { suppressMerchants })`:
bucket each merchant's charges with `periodIndex` from `commitments.ts`, try `week` then
`month`, require ≥ 8 periods spanned and ≥ 75% of them carrying a charge, ignore amount
entirely. Return merchant, period, coverage, `chargeCount`, `lowCents`/`highCents`, the median
per-period total, and `lastChargeOn`.

`RecurringMerchant` gains `shape: "bill" | "spend"`. `dashboardQueries.ts:308` merges both
detectors, bill-shaped winning any merchant both claim, and applies the same
already-claimed/dismissed filter to each. Test that Walmart's real dates qualify weekly, and
that a merchant appearing in 3 of 26 weeks does not.

## Task 5: Categories

- `classify/categorize.ts` — `categorize(description, sourceCategory, commitmentCategory?)`,
  with the commitment category ranked above a rule match and below the row's own `category`.
- `classify/reclassify.ts` — `planReclassify` takes `commitmentCategories: Map<merchant, string>`
  built from both tiers' matchers, and passes it through.
- `mutations.ts` — `reclassifyTransactions(userId)` builds that map; a commitment upsert whose
  category changed triggers it. `changedRows` already makes a no-op write nothing.
- Both grids get a Category select column (the `FINANCE_CATEGORIES` list plus blank), filterable
  and groupable like any other `DataGrid` enum column.

Tests: precedence in all four ranks; setting a commitment category moves exactly the matched
rows and leaves a per-row override alone.

## Task 6: Aliases and the overlap warning

- `commitments.ts` — `aliasOverlap(existing, candidate, cadence)` returning the dated pairs
  whose gap is under 60% of the cadence and whose two charges come from different aliases.
  Pure, tested against a clean-handoff series (no warning) and an interleaved one (warned).
- `mutations.ts` — `addMatchersToCommitment(userId, { kind, name, matchers })`, appending under
  the D3 exclusivity check, `userId` first, ownership proven before writing.
  `actions.ts` stays a thin wrapper. Integration test includes a second user failing.
- `ReviewList.tsx` — `BillDraft` gains the new-vs-existing choice `SpendDraft` already has, and
  renders the warning above the commit button when the target is a bill and the check fires.
  `CommitmentsView` passes `billCharges` down so the check runs on real dates.

## Task 7: Next charge, and what `anchorDate` means

- `commitments.ts` — `billAnchor(bill, lastCharge, todayKey) → { periodStartKey, nextDueKey }`,
  the single answer to D7's two readings. `commitmentRows.ts` and `available.ts:periodStart`
  both call it; neither keeps its own conditional.
- `ReviewList.tsx` — prefill Next charge from `nextDueFrom(entry.lastChargeOn, cadence, today)`,
  recomputing on cadence change until the field is touched.
- Test the case that is currently wrong: a bill with no posted history and a future anchor must
  accrue over the window ending at that anchor, not a window starting there.

## Task 8: The URL column

`commitmentColumns.tsx`, plus a small `UrlCell` in
`src/components/finances/commitments/` — local, because this is the only grid with a link
column and `components/clean-code` forbids speculative generality.

Read mode: hostname, `www.` and scheme stripped, as an `<a target="_blank"
rel="noopener noreferrer">`. Trailing pencil button, `opacity-0 group-hover:opacity-100
focus-visible:opacity-100`, `title="Edit URL"`. Edit mode: the existing borderless input,
autofocused, Enter/blur commits, Escape reverts. Empty: an `Add link` button entering edit mode.
`https://` is prepended on commit when no scheme is present.

Rename `cancelUrl` → `url` through `mutations.ts`, `dashboardQueries.ts`, `find/queries.ts`,
`find/searchable.ts` (the detail label becomes "URL"), `agent/contracts.ts`, `agent/tools.ts`,
`agent/financeTools.ts`. The strict-schema break is deliberate, per the clarity spec's
precedent: an agent passing `cancelUrl` should fail loudly.

## Task 9: Page order and copy

`CommitmentsView.tsx` — Review moves below Recurring spend. The bills empty state stops saying
"from Review above"; the Review help line stops implying the grids are below it.

## Task 10: Agent surface

`agent/contracts.ts`, `tools.ts`, `financeTools.ts` — `category` and `cadenceDays` on both
upserts, `url` replacing `cancelUrl`, and `add_commitment_matchers` following the existing
strict-schema, intent-shaped, compact-output pattern (`api/agent-tools`). Extend
`financeTools.integration.test.ts` and `toolContracts.integration.test.ts`, cross-user case
included.

## Task 11: Verify, freeze spec, update roadmap

- `npm run lint`, `typecheck`, `test:unit` (confirm the DB tests did not skip), `build`.
- **`npm run smoke` with the dev server up** — `src/app/**` changes and nothing else in the gate
  evaluates a `"use server"` module.
- Walk the acceptance criteria in the running app against the live database: Walmart in Review,
  Vetsource at 28 days with a September 11 next charge, an alias merge that warns and one that
  does not, Vetsource → Pets reaching Insights.
- Complete **Changes from original plan**, mark both docs **Status: frozen / complete**, and
  note on `agent-os/product/roadmap.md` whether anything in § Financial planning moved.

---

> **Standing rule while this spec is active:** when a material change lands on requirements,
> design or scope — including feedback on what was actually built — update the relevant section
> above and append a row to **Changes from original plan**. Skip pure implementation details.
> Freeze when verified.

## Corrections after freeze (2026-08-21)

Recorded rather than re-ticked: the criteria below were marked verified on the strength of
tests and a browser pass that did not cover the write path from the grid. What the user found
within the hour, and what it cost, is the useful part of the record.

- **"Both tiers carry a category … and it recategorises the charges it matches"** was true of
  the mechanism and false of the surface on the spend grid. `spendCtx.onPatch` copied the
  patch **field by field**, and `category` was not in the list, so the select wrote nothing
  and snapped back on refresh. The bills handler had been updated and the spend one had not.
  Both now forward the patch whole, and both patch types are derived from the edit types, so
  the compiler refuses a field the write cannot honour — this class of bug cannot recur by
  omission.
- **The Category column was invisible on any grid whose layout had been saved before it
  shipped.** A stored `order` is a list of the _visible_ columns, so a column added later is
  indistinguishable from one the user hid. `GridSettings.known` now records the column set a
  layout was written against, and `withNewColumns` shows anything neither listed nor known.
  This was never specific to Commitments: it applied to every column ever added to a grid
  someone had arranged.
- **A refused write in Review reported itself off-screen.** Moving Review to the foot of the
  page (D8) left its errors rendering in the page-level line above the two grids, a full
  screen away, so a refusal read as the change silently undoing itself. Review now reports its
  own failures in Review.
- **A dismissed row can refuse a merge while naming a commitment nobody can see.** Dismissed
  bills keep their matchers on purpose, so `"CVS" already belongs to the commitment "CVS"` was
  a true sentence about an invisible row. The message now says which holder is dismissed.

## Follow-ups (new work — not amendments to this frozen spec)

- **`1PASSWORD` vs `1PASSWORDTORONTOON`**, still outstanding from the clarity spec. The row
  reads `$71.88 ready · overdue` because the March 2026 charge posted under a shorter merchant
  string the bill does not match. This spec built the fix — the Matchers cell, or a join from
  Review — but the data edit is the user's to make.
- **Merging two commitments that both already exist.** Still delete-and-re-add; only the
  review-list half of the clarity spec's D5 is superseded here.
- **A double-charge watch after a merge.** The overlap check runs at merge time only. A merged
  bill that later posts twice in one cycle is not flagged, and could be, alongside the D8 stale
  check.
- **The Review panel on a phone**, still open from the clarity spec.
