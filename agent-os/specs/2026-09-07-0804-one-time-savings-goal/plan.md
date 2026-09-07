# A goal you finish: the one-time savings target

**Status: active**
Spec folder: `agent-os/specs/2026-09-07-0804-one-time-savings-goal/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` **D1, D2** — one target per
  envelope, with behaviour and cadence as explicit axes. This adds a fourth row to D2's matrix
  and changes nothing already in it. D2's own note that "`balance` + a repeating cadence _is_
  `upTo` — the only difference is what happens after the anchor passes" is the argument this
  spec extends one step further: what happens after the anchor passes is exactly what separates
  a floor from a finished goal.
- **Extends:** `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/` **D1, D3** — the
  behaviour axis decides the basis; the bar mirrors the ask. This spec is that one's own named
  follow-up, and it takes both rules verbatim rather than reopening them.
- **Extends:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` **D2, D3** — `since` is the
  month a target started asking, and a deadline-free ask is ranked last so it cannot drain Ready
  to Assign ahead of groceries. Both carry forward; `since` becomes load-bearing here in a way it
  was not before. Read with
  `agent-os/specs/2026-08-28-2146-target-since-month-granularity/`, which makes `since` a month
  guard rather than a day filter.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` **D3** — one pure ask,
  shared by Assign, the pill, the bar and the drawer. Still the reason this is one change in
  `demand.ts` plus the plumbing that feeds it, and not a display patch.

- **Supersedes:** nothing. `balance` stays a floor on the Available basis and `upTo` stays a pile
  on the carry-in basis, both verbatim. This spec adds a third answer rather than correcting
  either of the two.

Checked and unaffected: `target-snooze` (its seam sits above every family and zeroes the target
term whatever the basis), `overassigned-available` (it sits in front of the ask, reading
`assigned − needed`, which is basis-independent), `still-needed-this-month` (the header is the
same ask itemised, so it moves by construction), `bill-anchor-retires` and
`bill-due-dates-and-lead-time` (no bill can hold this behaviour — `schedule` is not a legal
cadence for it).

## Context

`pile-spent-is-not-a-raid` shipped on 2026-09-06 and was verified on the deployed app. Lee then
asked the question that this spec answers:

> Does it work the same for savings? For example, I set a goal for 100,000 for the money my dad
> gave me for down payment on the house so that if I had to use some of it because I went over
> budget I'd be reminded to put it back. But I wired the 5,000 for the earnest payment, and I
> marked that transaction with the House category, which should indicate that it's being used for
> what its purpose was, so it shouldn't need to be returned. Unless we have a distinction for a
> savings goal like medical expenses, car repairs etc where we want to have a certain amount
> available and then replace it after used, vs (what I use it for so far) saving up a certain
> amount so that it can be used for a specific purpose, after which it is done.

It does not work the same, deliberately. His House envelope is `balance` + `none` $100,000, and
`balance` is defined as a floor that measures Available (`ynab-target-engine` D4, kept
deliberately by `pile-spent-is-not-a-raid` D1). So the $5,000 wire reads as a raid and the
envelope asks for $5,030 back. That is working as specified, and the specification is what is
wrong for this envelope.

The model has two shapes where it needs three:

| Shape                        | Example                | Target                     | Basis            |
| ---------------------------- | ---------------------- | -------------------------- | ---------------- |
| A floor you refill           | Medical, car repairs   | `balance` + `by`/`none`    | Available        |
| A pile you spend and rebuild | Propane, a yearly bill | `upTo` + `year`/`schedule` | carry-in         |
| **A goal you finish**        | **House down payment** | **missing**                | **contribution** |

A floor is money that has to be _there_; spending it is what it is for, and it still has to come
back, because the next emergency is coming. A pile is money that is meant to _leave_ on a cycle;
paying the bill it was saved for is the pile working. A one-time goal is neither: it has an
amount and no cycle, and spending it is **completion**, not consumption to be replaced.

**No month-local basis can answer it.** The obvious move — put it on the carry-in basis like a
pile — fails: next month carries in $95,000 against a $100,000 cap, so it asks for $5,000 every
month forever. Carry-in is the right measure for a pile precisely because a new cycle starts; a
one-time goal has no next cycle. What a one-time goal measures is **cumulative contribution since
the target started**, which is history rather than this month's numbers.

### Feasibility, verified before designing

- `queries.ts:412-423` already loads the **entire** allocation ledger for the user per render
  (`.where(eq(financeBudgetAllocations.userId, userId))`, no month filter). No new query, no
  schema change, no migration.
- `buildBudget` (`envelope.ts:326`) already walks the months in order, so a running contribution
  total is one accumulator inside a fold that exists.
- Only **three** sites construct a `DemandEnvelope` — `assign/plan.ts:124`,
  `templates/apply.ts:89`, `TargetDrawer.tsx:184` — so `budget-funding-indicators` D3's single
  seam holds, and adding a required field makes the compiler find every one.
- `compareUnderfunded` (`assign/plan.ts:230`) needs **no change**: `sinkingCadence` keys on
  `by`/`year` and `isDeadlineFreeFloor` on `none`, so the new behaviour buckets correctly by
  cadence alone.

## Decisions

### D1 — A fourth behaviour, `save`, legal with `by` and `none`

`TARGET_BEHAVIORS` gains `"save"`, and `LEGAL` (`targets/types.ts:84`) gains
`save: ["by", "none"]` — the same two cadences as `balance`, because a one-time goal either has a
deadline or does not, and no repeating cadence can express "once". That table stays the only copy
of the matrix, for the reason its own comment gives.

The drawer's "The job" radio, beside the floor it has to be told apart from:

```
The job
  ( ) Have this amount available (no deadline)
  (•) Save this amount in total, then it's done
```

`summarize()`: `Save $100,000.00 in total (no deadline)` and
`Save $100,000.00 in total by March 2027`.

**"in total" is load-bearing.** It is the phrase that says the measure is everything put in, not
what is sitting there — which is the entire difference from the line above it, and the thing a
reader picking between the two has to understand in one glance.

A fourth behaviour rather than a flag on `balance`: the axes are the model. `behavior` already
answers "what is the money for", and this is a fourth answer to that question, not a modifier on
the third.

### D2 — The basis: contribution since the target started

```
contributedSince(m) = carryIn(sinceMonth) + Σ assigned(k)   for k = sinceMonth … m
```

Everything ever put into the envelope since the target began counting, including whatever was
already in it then. Assigned is signed, so:

**Spending never reduces it; assigning money back out does** — a negative allocation, or a move
to another envelope. That single rule is both halves of what Lee asked for:

| What happens                                         | contributed | asks         |
| ---------------------------------------------------- | ----------- | ------------ |
| $100,000 saved, target met                           | $100,000    | $0           |
| Wire $5,000 earnest payment, categorised House       | $100,000    | **$0** ✓     |
| Next month, $95,000 carried in, nothing else happens | $100,000    | **$0** ✓     |
| Move $2,000 out to cover an overspend                | $98,000     | **$2,000** ✓ |
| Put the $2,000 back                                  | $100,000    | $0           |

The demand keeps `pileDemand`'s spread and changes only the basis:

```
gap    = max(0, amountCents − contributedSince)
left   = monthsLeft(cadence, month)      // null for `none`; floors at 0 after a `by` deadline
needed = left === null || left === 0 ? gap : max(0, round(gap / (left + 1)))
```

A met goal asks $0 for good. A `save` + `by` past an unmet deadline asks the whole remaining gap
every month, exactly as `balance` + `by` already does — no new rule, and no special case for a
deadline that has passed.

Counting `carryIn(sinceMonth)` and not assignments alone is what makes D5 safe: an envelope that
was already full when the target started reads met, rather than asking for the whole amount a
second time. It is also the honest reading of the sentence — "how much has ever gone into this
envelope since this target started counting" includes the balance it started from.

### D3 — The ask, the bar and On Track read the same basis

`pile-spent-is-not-a-raid` D3's rule, applied to the new behaviour. `BarFill` gains
`"contributed"`, and `horizonOf` (`indicator.ts:88`) returns it for `save` in **both** the
`sinking` and `floor` arms — a deadline-free goal lands in `floor`, which is the arm that
Change #2 of that spec had to widen for the same reason. The `on-track` comparison
(`indicator.ts:214`) reads the same number for `save` instead of `fundedCents`, so a half-saved
goal with a deadline reads On Track against its contribution.

Without this the bar drops to 95% the month after the earnest wire while the ask says $0 — the
second opinion D3 exists to prevent. `balance` and `upTo` bars are untouched.

### D4 — "Done" is computed, never stored

No column, no `completed_at`, no archive table, and no new rung in the state ladder that
`overassigned-available` D4 settled. When `contributedSince >= amountCents` the existing `funded`
state carries its own copy:

```
House      $95,000.00   ● Goal met — $100,000.00 saved
           ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░    bar full on contribution, 5% spent overlay
```

Nothing is recorded, so nothing can go stale, and the state is self-correcting in both
directions: pull money back out and it is no longer met, put it back and it is again. That is
the same property the snooze column bought by being keyed to a month —
expiry is free when the fact is derived.

After closing on the house the envelope falls through to the existing gray **Fully Spent** at $0
Available, which is the honest end of a down-payment fund and needs no new state at all.

Deleting the target loses `since` and restarts the count. That is the existing behaviour of
`saveEnvelopeTarget(…, null)` and stays; a one-time goal is the shape where it matters most, so
it is worth saying out loud rather than discovering.

### D5 — No migration; the job is re-picked by hand

Nothing can tell a floor from a finished goal by looking at it, and medical and car repairs are
genuinely floors that must stay floors. An automatic conversion of `balance` targets on savings
envelopes would silently convert exactly the ones that are right today.

Lee opens House's target drawer and switches "The job". `since` is preserved across an edit
(`mutations.ts:1546` stamps it only on an envelope's first target), and because D2 counts
`carryIn(sinceMonth)`, the envelope reads met the moment he saves — no phantom $100,000 ask, and
no need to restart `since`.

## Acceptance criteria

- [ ] **House** — `save` + `none` $100,000, funded in full, $5,000 wired out and categorised
      House — asks **$0**, and still asks $0 the following month at $95,000 carried in.
- [ ] Moving $2,000 out of House asks **$2,000** that same month; putting it back returns it to
      $0.
- [ ] A half-saved `save` + `by` spreads: $100,000 by 2027-03 with $0 contributed asks
      **$14,285.71** in September 2026 (seven months inclusive), and reads **On Track** once that
      is assigned.
- [ ] A `save` + `by` past an unmet deadline asks the whole remaining gap, like `balance` + `by`.
- [ ] The bar fills to 100% on contribution while Available sits at $95,000 — the ask and the bar
      do not disagree.
- [ ] **Guard:** a `balance` + `none` $100,000 floor raided to $94,970 still asks **$5,030 this
      month** (`target-refill-basis` D3 intact), and every `upTo` case in `demand.test.ts` is
      unchanged.
- [ ] The legality table rejects `save` × `week` / `month` / `year` / `schedule` at parse, and a
      stored blob carrying one of those does not reach the evaluator.
- [ ] The Budget header's "still needed", the amber per-row pills, Assign → Underfunded and Apply
      Targets all move together — none of them gains a second opinion. An unmet House sorts into
      the deadline-free bucket, last.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

> **While this spec is active:** a material change to requirements, design or scope — including
> feedback on what was actually built — updates the sections above and appends a row here. Skip
> pure implementation details. Freeze when verified.

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md` and `references.md`. No `visuals/`
— this is a model correction and none were provided. Commit and push.
**Shaping ends here**; implementation starts in a fresh session at Task 2.

## Task 2: The behaviour and the basis

- `targets/types.ts` — D1. Add `"save"` to `TARGET_BEHAVIORS`, `save: ["by", "none"]` to `LEGAL`,
  and the `summarize()` arms. `types.test.ts` covers the matrix going from eight legal pairs to
  ten, and each new rejection.
- `targets/demand.ts` — D2. `DemandEnvelope` gains `contributedSinceCents`; `pileDemand` picks it
  for `save`, alongside `availableBefore` for `balance` and `carryInCents` for `upTo`. Rewrite the
  module header: the load-bearing claim becomes **three bases, one spread — the behaviour picks
  the basis and the cadence picks the spread**.

Tests named for the claim they defend, in `targets/demand.test.ts`:

- _"a goal spent on its own purpose is finished, not raided"_ — the reported case, and the month
  after it.
- _"assigning money back out of a finished goal asks for it back"_ — the other half of D2, and
  the reason Lee set the goal.
- _"a goal with a deadline spreads what is left over the months it has"_ and _"a goal past its
  deadline asks the whole gap"_.
- _"a raided floor still asks this month"_ — `balance` + `none` unchanged, the guard on D2's blast
  radius.

## Task 3: The fold that supplies it

- `envelope.ts` — `CategoryMonth` gains `contributedSinceCents`, and `BudgetInput`'s category
  shape gains an optional `contributionsFrom?: MonthKey`. Keep `buildBudget` **target-agnostic**:
  it answers "how much has gone into this envelope since month M", and knows nothing about goals.
  Absent `contributionsFrom` means from `startMonth`.
- `queries.ts:443-447` — pass `contributionsFrom` from the parsed target's `since`, month-granular
  per `target-since-month-granularity`. `parsedCategories` (`queries.ts:231-261`) already holds
  the parsed target.
- `rows.ts` (`BudgetRow`), `assign/types.ts` (`AssignEnvelope`), `assign/fromBudget.ts`
  (`assignEnvelopeFromRow`) — carry the number through. Required, not optional, so the compiler
  names every site.
- `envelope.test.ts` — months before `since` contribute 0; the `since` month seeds with its
  carry-in; a negative allocation reduces the total; **activity never does**. Say in the code that
  `carryover: false` clamps a negative carry-in to 0, and that a savings envelope carries over, so
  the clamp is not reachable for the shape this is for.

## Task 4: The indicator

`indicator.ts` — D3 and D4. `BarFill` gains `"contributed"`; `horizonOf` returns it for `save` in
both arms; `on-track` compares contribution for `save`; the `funded` arm gains the
`Goal met — $X saved` copy. Confirm the ladder order is unchanged and that a fully-spent goal
still reads Fully Spent. `indicator.test.ts:260` (the floor) and `:366-397` (the pile) must pass
untouched — they are the blast-radius guard.

## Task 5: The drawer

`TargetDrawer.tsx` — `behaviorsFor` picks the new option up from `isLegalPairing` for free; add
the `sentence()` arms. The live preview needs `contributedSinceCents`: use the row's number when a
stored target exists (its `since` is preserved on save), and `carryIn + assigned` when there is
none — which is exactly what a target starting today has contributed, so the preview and the saved
result agree. This is the same rule `TargetDrawer.tsx:176-182` already applies to `since`, for the
same reason.

## Task 6: Confirm the seam, do not widen it

No edit expected in `assign/plan.ts` (`neededAssigned`, `stillNeeded`, `stillNeededGroups`,
`compareUnderfunded`, reduce-overfunding), `templates/apply.ts`, `incomePlan.ts`, `snooze.ts` or
`BudgetSummary.tsx` — they all read `targetDemand` / `neededAssigned`, the single seam. Prove it
with the existing suites rather than new plumbing. If any of them needs an edit, that is a finding
worth writing into **Changes from original plan**, not a quiet patch.

## Task 7: Full gate

`npm run test:unit`, `npm test`, `npm run lint`, `npm run typecheck`. Nothing here touches the
database or a mutation's `userId` scoping, so no new integration test — say so in the commit
rather than leaving it inferred. Components do change, so start the dev server and run
`npm run smoke`.

## Task 8: Verify on the deployed app, freeze spec, update roadmap

The development database is a seed; these numbers exist only in production, so the walk is on the
deployed app (`lee-validates-on-the-deployed-iphone` — push to `master` first).

- Switch **House** to the new job. It must read **Goal met** at $0 asked, with a full bar and
  $95,000 Available — not $5,030 short.
- The header's "still needed" before and after, and the **What's still asking** rows: House leaves
  the Savings subtotal.
- Move $2,000 out of House and confirm it asks for exactly $2,000; move it back.
- **Guard on the live budget:** a genuine `balance` floor (medical, car repairs) is unchanged, and
  every yearly `upTo` pile still reads as it did after `pile-spent-is-not-a-raid`.

Then align this file with as-built reality, complete **Changes from original plan**, mark both
`plan.md` and `shape.md` **frozen / complete**, and add the roadmap entry after
`agent-os/product/roadmap.md:1215`, whose closing sentence — "and is the next spec" — this work
answers.
