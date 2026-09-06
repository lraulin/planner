# A pile spent on its own purpose does not ask again

**Status: active**
Spec folder: `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` **D1** — the pile
  half of "two families, two bases", for `upTo` piles only. The `balance` half carries
  forward verbatim, and D2, D3 and D4 carry forward unchanged.
- **Supersedes:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` **D4** for `upTo`
  targets. What survives is exactly its title: **`balance`**-style targets measure against
  Available, never carry-in. Its worked example ($500 floor, carry-in $400, spent $200 →
  $300) was already reversed for the period family by `target-refill-basis`; this spec
  finishes the sentence.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` **D2** — the behaviour ×
  cadence matrix. This spec adds no shape; it makes `behavior` the axis that decides the
  basis, which is what D2 already made it for everything else.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` **D5** — a bill's cadence
  seeds a derived `upTo` + `schedule` target, which is the shape the reported bug arrived on.
- **Extends:** `agent-os/specs/2026-08-25-1310-budget-funding-indicators/` **D3** — one pure
  ask, shared by Assign, the indicator and the drawer. Still the reason this is one change to
  `demand.ts` rather than a display patch.
- **Extends:** `agent-os/specs/2026-09-06-1215-still-needed-this-month/` — the Budget header's
  figure is this same ask, itemised, so it moves with it by construction.

Checked and unaffected: `target-snooze` (its seam sits above both families and zeroes the
target term whatever the basis), `overassigned-available`, `target-since-month-granularity`
(supersedes `target-refill-basis` D2 only), `bill-due-dates-and-lead-time`.

## Context

Lee's September 2026 budget asked him to assign **$190.62** to Dropbox — a $127.08 **yearly**
bill that had already been charged that month — and would not read Funded until he did. He
had $63.54 carried in and genuinely needed $63.54; the extra $127.08 was the app asking him
to re-save the whole year immediately after paying it. In his words:

> It's a yearly bill… and it was charged this month. But it was saying it wasn't fully funded
> until I put in enough… I guess to still have enough left over to pay it again, after it was
> already paid? Seems like available should be $0 and it should be fully funded, because I put
> in enough, then used it, and now I have to start saving up again for the next charge, 1/12th
> of it per month, starting next month.

Reproduced against the engine itself. `pileDemand`
(`src/lib/finances/budget/targets/demand.ts:120`), with `monthsLeft = 0` because September is
the month the charge is due:

```
needed = (amount − availableBefore) / (monthsLeft + 1),  availableBefore = carryIn + activity
       = (127.08 − (63.54 − 127.08)) / 1
       = 190.62                                  ← exactly what he assigned
```

It is not Dropbox-specific. **Every** pile target does this in the month its charge lands.
Propane, `upTo` + year, $1,200 due October, run through `demandForTarget`:

| Propane                          | asks today   |
| -------------------------------- | ------------ |
| Aug, nothing saved               | $400.00 ✓    |
| Oct, $1,200 saved, not yet paid  | $0.00 ✓      |
| **Oct, $1,200 saved, bill paid** | **$1,200 ✗** |
| Nov, empty again                 | $100.00 ✓    |

`target-refill-basis` fixed exactly this class of bug for the **period** family — "spending
money that was already assigned for that spending cannot ask for it again" — and deliberately
left the **pile** family on the Available basis so that a _raided_ pile would ask for it back.
The basis cannot tell a raid from the pile doing its job, and in the charge month those two
are the same arithmetic. That spec's acceptance criteria checked propane in August and in
November; never in October, the month it breaks.

`assignedToZeroBalance` was doing its job throughout: $63.54 of the $190.62 was the real
shortfall (Lee had saved only half a year). The phantom $127.08 is the whole of this spec.

## Decisions

### D1 — The behaviour axis decides the basis; the cadence axis decides the spread

```
add     → the whole cap                                      (unchanged)
upTo    → cap − carryIn, spread over monthsLeft + 1 when the cadence is a pile
balance → amount − Available                                 (unchanged)
```

`upTo` is a **spending** target: the money is meant to leave, and what came _in_ is the
measure. `balance` is a **floor**: what is sitting in it is the point, so raiding one still
nags. Since `add` is legal only with `week`/`month` and `balance` only with `by`/`none`
(`ynab-target-engine` D2), the pile family splits cleanly — `upTo` + `year`, `upTo` +
spreading `schedule` change; `balance` + `by`, `balance` + `none` do not.

`pileDemand` therefore takes the envelope rather than a pre-computed number and picks its own
basis. `availableBefore` keeps its name and becomes **the floor basis**, not the pile basis;
it is called from nowhere else in the tree.

Chosen over the narrower alternative — keep the Available basis but ignore activity when
`monthsLeft === 0` — because that one's answer depends on whether a bill's anchor happened to
roll forward mid-month: the same paid October propane reads $0 with a stale anchor and $92
with a rolled one. D1 is robust to anchor timing, and it leaves the model simpler than it
found it.

### D2 — Consequences accepted, not worked around

Both are the trade `target-refill-basis` already took for the period family.

- **A raid on an `upTo` pile in a non-charge month is noticed the following month**, not the
  same day, because `carryIn` carries every _prior_ month's spending. Raid $800 of propane in
  August and August asks $133 instead of $400; September's carry-in is short and the ask
  climbs to $533. Deferred, not lost.
- **An `upTo` pile raided in its charge month, before the charge lands, reads Funded** until
  the charge posts — then Available goes negative and `assignedToZeroBalance` asks for all of
  it, in red. This is the same "activity is consumption of funding" assumption the period
  family makes.

### D3 — The bar mirrors the ask

`indicator.ts`'s `sinking` horizon fills with Available. For an `upTo` pile that is now a
second opinion — the ask no longer reads Available — so it fills with `funded`
(`carryIn + assigned`), for the same reason the period bar already does
(`budget-funding-indicators` D3: the bar must not invent a second demand). `balance` piles
keep the Available fill, because that is still their ask.

### D4 — The bill anchor is a separate question

`lastChargeByEnvelope` advances a bill's anchor only through a **claimed** payee
(`billLastCharge.ts`), so a charge categorised by hand leaves `expectedKey` pointing at a
charge that has already been paid. The $190.62 reproduction needs `monthsLeft = 0`, which
means Dropbox's anchor is very likely stale — but D1 gives $63.54 in **either** anchor state,
so this is a Bills-page display question, not an ask question. Task 6 checks it on the
deployed app; if it is real it gets its own spec.

## Acceptance criteria

- [ ] **Dropbox** — derived `upTo` + `schedule` $127.08 yearly bill, September 2026, carry-in
      $63.54, activity −$127.08 — asks **$63.54**, with the expected charge at 2026-09 _and_
      at 2027-09. Assigning $63.54 leaves $0 Available and reads **Fully Spent**.
- [ ] At the $190.62 assigned today, the same envelope reads **"$127.08 extra"**
      (`overassigned`), so Reduce Overfunding hands it back to Ready to Assign.
- [ ] **Propane** `upTo` + year $1,200, October: August still **$400**, November still
      **$100**, and October after the charge posts is **$0**, not $1,200.
- [ ] The month a pile is emptied asks nothing more, and the next month restarts the
      installments. Propane paid in November asks **$0** in November and **$109.09/month**
      from December. This **reverses** `targets/demand.test.ts:168` ("asks a raided pile for
      it back: $100/month once the year's propane is spent"), deliberately — Lee's rule is
      "start saving up again… starting next month."
- [ ] A raided **`balance` + `none`** $100,000 floor with $94,970 Available still asks
      **$5,030 this month** (`target-refill-basis` D3 intact), and `balance` + `by` is
      unchanged in every month, before and after its deadline.
- [ ] A raid on an `upTo` pile in an accumulation month is asked for through **carry-in the
      following month** — a test named for it, because it is D2's accepted cost and the thing
      a later reader will most want to see stated.
- [ ] Overspend still floors: Available −$500 asks at least $500 whatever the target says.
- [ ] The Budget header's "still needed", the per-row amber pills, Assign → Underfunded and
      Apply Targets all move together. None of them gains a second opinion.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The Dropbox acceptance figure is **$63.54 with a stale anchor and $4.89/month with a rolled one**, not $63.54 in both.            | D4's claim that D1 "gives $63.54 in either anchor state" was arithmetic that had not been run. A rolled anchor puts the charge 12 months out, so the same $63.54 hole is spread over thirteen months. The point D4 was making survives intact — the phantom $127.08 is gone either way, and the anchor is still a display question — but the number is not the same one, so the test pins both figures rather than asserting a shared one. |
| 2   | D3's bar change applies to the **`floor` horizon as well as `sinking`** — the fill basis follows the behaviour in both pile arms. | `horizonOf` calls a pile `floor` whenever `monthsLeft` is 0, which is exactly the charge month the bug was reported in: an `upTo` pile paying its own bill lands in `floor`, not `sinking`. Restricting the change to `sinking` would have left the reported envelope's bar reading Available while its ask read carry-in — the second opinion D3 exists to prevent.                                                                       |

> **While this spec is active:** a material change to requirements, design or scope — including
> feedback on what was actually built — updates the sections above and appends a row here.
> Skip pure implementation details. Freeze when verified.

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md` and `references.md`. No
`visuals/` — this is a formula correction and none were provided. Commit and push.
**Shaping ends here**; implementation starts in a fresh session at Task 2.

## Task 2: The basis

`targets/demand.ts`: D1. `pileDemand` takes the envelope and chooses `availableBefore` for
`balance`, `carryInCents` otherwise. Re-document `availableBefore` as the floor basis, and
correct the module header — the load-bearing claim is no longer "two families, two bases" but
**two families, two spreads; the behaviour picks the basis**.

Tests named for the claim they defend, in `targets/demand.test.ts`:

- _"the yearly bill it was saving for does not ask to be saved again"_ — the reported bug,
  both anchor states.
- _"the month a pile is emptied asks nothing more"_ and _"the next month restarts the
  installments"_ — replacing `:168`, whose number this reverses.
- _"a raided `upTo` pile is asked for through next month's carry-in"_ — D2's cost, stated.
- _"a raided floor still asks this month"_ — `balance` + `none` unchanged, the guard on D1's
  blast radius.
- Overspend still reaching `assignedToZeroBalance`.

`targets/derive.test.ts`'s spreading-bill cases (`:175`, `:182`, `:197`) pass `activityCents:
0` and must still pass unchanged; add one with the charge posted.

## Task 3: The bar

`indicator.ts`: D3. The `sinking` horizon's bar fills with `funded` for an `upTo` pile and
keeps `available` for a `balance` pile — which means `horizonOf` needs the behaviour, not
only the family. Confirm the state ordering still holds for a paid pile:
`overspent` → `snoozed` → `underfunded` → `fully-spent` → `overassigned` → `on-track` →
`funded`. `indicator.test.ts:434` (yearly bill on-track/overassigned) and `:260` (floor) pin
the two sides.

## Task 4: Confirm the seam, do not widen it

No edit expected in `assign/plan.ts` (`stillNeeded`, `planUnderfunded`, `reduce-overfunding`),
`templates/apply.ts`, `incomePlan.ts` or `TargetDrawer` — they all read `targetDemand` /
`neededAssigned`, which is the single seam `budget-funding-indicators` D3 requires. Prove it
with the existing suites rather than new plumbing; `templates/apply.test.ts:204–234` (the
semi-annual bill) must pass untouched. If any of them needs an edit, that is a finding worth
writing into **Changes from original plan**, not a quiet patch.

## Task 5: Full gate

`npm run test:unit`, `npm test`, `npm run lint`, `npm run typecheck`. Nothing here touches
`src/app/**` or the database, so no smoke run and no integration test — say so in the commit
rather than leaving it inferred.

## Task 6: Verify on the deployed app, freeze spec, update roadmap

The development database is a seed; these numbers exist only in production, so the walk is on
the deployed app (`lee-validates-on-the-deployed-iphone` — push to `master` first).

- `/finances/budget`, September 2026: Dropbox reads **"$127.08 extra"**; Reduce Overfunding
  returns it to Ready to Assign; at $63.54 assigned it reads **Fully Spent** at $0 Available.
- The header's "still needed" total before and after, and the **What's still asking** rows.
- Propane, Car Insurance (Geico), Amazon Prime and Curiosity Stream in their own charge
  months — every yearly envelope was carrying this.
- **D4 check:** the Bills page's _Next charge_ for Dropbox. September 2026 means the anchor
  never rolled past the paid charge and wants its own spec; September 2027 means it did.

Then: align this file with as-built reality, complete **Changes from original plan**, mark
both `plan.md` and `shape.md` **frozen / complete**, and correct `agent-os/product/roadmap.md`
at the **Target refill basis** entry (`:1170`), whose prose still states the superseded pile
rule.
