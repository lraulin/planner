# A goal with no deadline never asks

**Status: active**
Spec folder: `agent-os/specs/2026-09-07-1140-deadline-free-goal-never-asks/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-09-07-0804-one-time-savings-goal/` **D2**, in one respect
  only — the `left === null` arm of its demand, and with it the acceptance criterion "Moving
  $2,000 out of House asks **$2,000** that same month". Everything else in D2 stands: the basis
  is still cumulative contribution excluding this month's Assigned, spending still never reduces
  it, and `save` + `by` still spreads the remaining gap across the months it has.
- **Extends:** the same spec's **D1** (a fourth behaviour, two cadences), **D3** (the bar mirrors
  the ask) and **D4** ("done" is derived, never stored) — all untouched.
- **Extends:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` **D3**, and does **not**
  supersede it. `balance` + `none` keeps asking `amount − available` this month, because a raided
  emergency fund has to nag. That rule was always about floors; this delta says it never applied
  to goals.

Checked and unaffected: `compareUnderfunded`'s deadline-free bucket (`target-refill-basis` D3)
still serves `balance` + `none`, which is the only shape that can now land in it with a gap.

## Context

Reported by Lee the day `one-time-savings-goal` shipped, on his live budget:

> I thought we already addressed this: "$450.00 more needed this month" for my Handgun savings
> target with no deadline. No deadline means just put in however much you want when you can; once
> you have enough, then you can buy it. Instead it wants the full amount immediately.

Measured before designing — both deadline-free jobs ask the whole remaining amount:

| Target                   | Saved |     Asks |
| ------------------------ | ----: | -------: |
| `save` + `none`, $450    |    $0 | **$450** |
| `save` + `none`, $450    |   $50 | **$400** |
| `balance` + `none`, $450 |    $0 | **$450** |

So switching Handgun to the new job would not have fixed it. This is a gap in the shipped
behaviour, not a mis-set target.

**Why it shipped.** `pileDemand`'s `left === null → ask the whole gap` line was inherited from
`balance` + `none` (`target-refill-basis` D3) and `save` was added as a new _basis_ under it
without asking whether the arm itself was right for a goal. Every acceptance criterion in
`one-time-savings-goal` exercised a **met** House — the wire, the month after, the withdrawal —
so the gap was always zero and the deadline-free arm never ran with anything in it. An unmet
deadline-free goal starting from nothing is the one case that shows the behaviour, and it was
the one case not written down.

## Decisions

### D1 — `save` + `none` asks nothing, always

A monthly ask needs either a cadence or a deadline. `week`, `month` and `year` supply a cycle;
`by` supplies a horizon to divide by. A one-time goal with neither has no denominator, so any
monthly figure is invented — and "the whole thing, now" is the most invented of them.

In Lee's words, which are the rule:

> Since there's no deadline, there's no target to fall short of, so no "ask".

`save` + `by` is unchanged: the deadline is exactly what makes an installment meaningful, and it
still spreads the remaining gap across the months it has, including asking the whole gap once the
deadline has passed.

### D2 — A withdrawal from a met goal no longer asks either

`one-time-savings-goal` D2 made "assigning money back out re-opens the ask" the other half of its
formula, and it was the reason Lee set the House goal at all. It goes, deliberately and with his
decision on the record:

> So if I was premature in thinking I had that much I could set aside it or need to move it
> elsewhere... That's fine, there's still nothing short.

A deadline-free goal that is no longer met stops saying **Goal met** and its bar drops off full.
That is the reminder. It is not an ask, and it never enters "still needed this month",
Underfunded or Apply Targets.

Rejected: tracking the highest contribution ever reached, so that only a goal that had _once_
been met would ask a withdrawal back. It satisfies both of Lee's statements and he was offered
it; he chose the simpler rule. It would also have put a second, stickier notion of "done" in the
fold, which is the copy D4 exists to avoid.

### D3 — An unmet deadline-free goal reads as progress, not as Overassigned

With the ask at $0, the existing ladder mislabels the shape twice: `extraCents = assigned − 0`
makes every assignment "extra", so $50 toward the handgun reads **Overassigned — $50.00 extra**,
and anything that gets past that reads **Funded**.

A `contributed`-basis **floor** horizon that has not reached its amount takes the existing
`on-track` rung, ahead of `overassigned`, with progress copy: `$50.00 of $450.00 saved`. No new
rung — D4's ladder is unchanged, and `on-track` is already the green "nothing is wrong, this is
filling up" state.

`save` + `by` keeps `overassigned` ahead of `on-track`: it has an installment, so assigning above
it genuinely is extra. The reordering is scoped to the deadline-free arm, which has no
installment for "extra" to be measured against.

## Acceptance criteria

- [ ] **Handgun** — `save` + `none` $450 with $0 saved asks **$0**, not $450, and reads
      `$0.00 of $450.00 saved` rather than Funded or Overassigned.
- [ ] $50 assigned to it asks **$0** and reads `$50.00 of $450.00 saved` — not
      **Overassigned — $50.00 extra**.
- [ ] **House** met, $5,000 wired and categorised House: still **Goal met**, still $0. The
      shipped behaviour Lee verified does not regress.
- [ ] House met, $2,000 assigned out: asks **$0**, and reads `$98,000.00 of $100,000.00 saved`
      with the bar off full. Supersedes the old $2,000 criterion.
- [ ] `save` + `by` is untouched: it spreads, reads On Track once the installment is assigned,
      and asks the whole gap past an unmet deadline.
- [ ] **Guard:** `balance` + `none` raided to $94,970 still asks **$5,030 this month**
      (`target-refill-basis` D3 intact), and every `upTo` and period case is unchanged.
- [ ] A deadline-free goal spent to $0 Available still reads **Fully Spent**.

## Changes from original plan

| #   | Change                                                                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The copy is **`$400.00 more needed eventually`**, not the progress phrasing `$50.00 of $450.00 saved` that D3 first specified.                                                   | Lee's, during implementation: "Like in YNAB, we could show the progress bar as green, and '$X needed eventually'", then "'$X more needed eventually'". It is YNAB's sentence for exactly this shape and this repo's own until `target-refill-basis` D3 retired it for floors, so it is a phrase a reader has seen before rather than a new one — and with "more" it is word-for-word the underfunded copy but for the one word carrying the meaning: **eventually**, not **this month**. The bar already carries the progress the rejected phrasing spelled out.  |
| 2   | The fix needed a second site: `neededAssigned` returns the envelope's own Assigned for a deadline-free goal when nothing is overspent, instead of `max(demand, overspendFloor)`. | Zeroing the demand was not enough. `gapOf` is `needed − assigned`, so in the month money is assigned **out** of a goal a $0 demand still reports the withdrawal as a shortfall — "$2,000.00 more needed this month", the exact sentence D2 removes. The clamp cannot live in `demand.ts`, which never sees this month's Assigned, and it cannot be a `max` against the overspend floor, which is always ≥ 0 and would swallow it. It belongs at the declared single seam, beside the snooze check, which is already where envelope-_month_ facts meet the target. |
