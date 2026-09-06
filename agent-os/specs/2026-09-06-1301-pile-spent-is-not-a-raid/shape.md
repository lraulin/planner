# A pile spent on its own purpose does not ask again — Shaping Notes

**Status: active**

## Scope

One correction to the target demand engine: an `upTo` pile (a yearly or quarterly bill, a
`upTo` + `year` savings target) measures its ask against **carry-in**, not against Available,
so that spending the pile on the very thing it was saving for cannot create a fresh demand
for the same money. `balance` floors keep the Available basis. The funding bar follows the
ask.

### Out of scope

- **The bill anchor.** Whether `expectedKey` rolls past a charge that posted through an
  unclaimed payee (plan.md D4). The fix is correct in either anchor state; if the anchor is
  stale it is a wrong _date_ on the Bills page and gets its own spec.
- **`balance` + `by` after its deadline.** It floors forever by design
  (`ynab-target-engine` D2: "the only difference between them is what happens after the
  anchor passes"). Spending a met `by` target and being asked for it again is that design
  working, and revisiting it is a different question from this one.
- **Deleting the dead parallel engine** (`budget/templates/demand.ts`,
  `templates/schedule.ts`'s `billFundingDemand`). Reachable only from its own tests since
  `targets/derive.ts` retired it; it will now disagree with the live engine, which makes it
  worth deleting, but under its own commit.
- Any schema, migration, copy or layout change. The numbers change; nothing else does.

## Decisions

- **Behaviour, not month, decides the basis.** The alternative shaped alongside it — keep
  Available but ignore activity when `monthsLeft === 0` — was rejected because its answer
  depends on whether a bill's anchor rolled forward mid-month ($0 with a stale anchor, $92
  with a rolled one, for the same paid October propane). Lee chose the behaviour split.
- **The model gets simpler, not more special-cased.** After this, `add` asks the cap, `upTo`
  asks the cap less carry-in, `balance` asks the amount less Available — and the cadence only
  decides whether that ask is spread over the months remaining. `ynab-target-engine` D4 ends
  up true to its own title.
- **A deferred raid is acceptable; a doubled ask is not.** Raiding an `upTo` pile in an
  accumulation month is caught through next month's carry-in rather than the same day. Stated
  as an accepted consequence with a test, not discovered later as a regression.
- **One frozen number is deliberately reversed**: `demand.test.ts:168` asserts that propane
  spent in November asks $100 that same November. It now asks $0 in November and $109.09 from
  December, which is Lee's stated rule — "start saving up again… starting next month."

## Context

- **Reported:** 2026-09-06, from the September budget export. Dropbox, $127.08/year, charged
  this month, demanding $190.62 assigned before it would read Funded.
- **Reproduced:** in-repo against `targetDemand` / `neededAssigned` with the live figures
  (carry-in $63.54, activity −$127.08) — $190.62 to the cent, and $1,200 for a paid propane
  in October. Not inferred from reading the formula.
- **Visuals:** none.
- **References:** see `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md`'s envelope-budget line. This corrects
  a shipped item rather than delivering a new one; the roadmap's **Target refill basis**
  paragraph states the superseded rule and is corrected at freeze.

## Standards Applied

- `development/testing.md` — the whole change is pure logic in `src/lib/**` with tests beside
  it; each test named for the claim it defends, none restating the implementation.
- `development/clean-code.md` — "when the model is wrong, change the model": replace the
  basis rather than special-case the charge month.
- `development/commits.md` — one logical change per commit, `Spec:` trailer to this folder.
