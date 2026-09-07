# A floor rebuilds all at once, and the drawer should say so

**Status: frozen / complete** (2026-09-07)
Spec folder: `agent-os/specs/2026-09-07-1245-a-floor-rebuilds-all-at-once/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-09-07-1210-the-job-names-what-happens-after/` **D2**, one
  cell of its table — the `balance` hint stops naming a car-repair or medical fund as its use
  case. D1 stands entirely: the label still names the job, the hint still names what happens after
  the money is spent, and neither mentions the cadence.
- **Extends:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` **D3** — a deadline-free floor
  asks `amount − available` **this month**, and is ranked last so it cannot drain Ready to Assign
  ahead of groceries. That behaviour is **unchanged here**, deliberately. This spec records why it
  is now known to be wrong for one use case, and why it is not being changed yet.
- **Extends:** `agent-os/specs/2026-09-06-1215-still-needed-this-month/` — a deadline-free floor
  counts toward the header's ask. That is the surface where this hurts.

## Context

Raised by Lee while reading the new drawer copy, about the use case its own hint recommends:

> If I had to use an emergency fund, I'd want to start over saving up for it over time again. If
> it demanded the whole thing, that would throw off the whole calculation for how much I need for
> the month, as it would thereafter say I'm short to the amount of whatever I spent from the
> emergency fund, on the thing the emergency fund was for, which I successfully saved up for
> ahead of time and paid out of the set aside money...

Measured, before designing anything. A $5,000 car-repair fund, fully saved, with a $2,000 repair
categorised to it:

| Quantity                |      Value |
| ----------------------- | ---------: |
| Asked this month        | **$2,000** |
| Added to "still needed" | **$2,000** |

He is right, and it is the **same failure this whole line of work has been fixing**: money spent
on the envelope's own purpose reading as a shortfall. `pile-spent-is-not-a-raid` fixed it for
`upTo` piles, `one-time-savings-goal` for goals, and `deadline-free-goal-never-asks` for
deadline-free goals. `balance` + `none` is the last shape still doing it — and it lands in the
header figure that those specs made honest.

**The difference is that a floor genuinely should be rebuilt.** Spending an emergency fund is not
completion, so asking $0 forever (the `save` answer) is wrong too. The bug is not _that_ it asks;
it is that it asks for the whole hole **in one month**, with no way to say how fast.

### The shape that is missing

Lee's own description of what he would want:

> Put aside $X/month no matter what... if it's spent it's spent, if it accumulates, it
> accumulates... Either way, keep setting aside X every month... Except maybe you might want to
> set a cap, and say, ok, now we're prepared for that contingency; there are better uses for the
> money than to keep growing the emergency fund forever.

That is **`add` + `month`, with a ceiling**: set aside $X a month until the balance reaches $Y,
then stop asking. And on a deadline for such a fund:

> I'm not seeing how it would be helpful to have a deadline to have $X in an emergency fund, as it
> would be arbitrary and artificial... You don't know how much you need or by when; that's the
> whole point.

Which is correct, and rules out the two shapes that already spread a hole over time (`by` and
`year`) — both need a date the user does not have.

No existing pairing expresses it:

| Candidate          | Why it is not this                                                         |
| ------------------ | -------------------------------------------------------------------------- |
| `add` + `month`    | Asks $X every month **forever** — no ceiling, so the fund never finishes   |
| `upTo` + `month`   | Refills to the cap **monthly**, so it demands the whole hole next month    |
| `balance` + `none` | Demands the whole hole **this** month — the reported problem               |
| `save` + `none`    | Never asks again; correct for a goal, wrong for a fund meant to be rebuilt |

It needs a **second number** on the target — a rate and a ceiling — which the model has never had:
`Target` carries one `amountCents`. That is a model change, not a new pairing.

## Decisions

### D1 — Do not build it yet

The missing shape is real and well understood, and it is still **speculative** for this codebase.
Lee, in the same message:

> The car-repair or medical fund is a use case I haven't used yet (and might not need the latter,
> since I have an HSA... probably should start setting aside in case of a needed car repair, but
> it's not a priority yet)... This is the one scenario that I think hasn't been well-developed
> since it hasn't been a real use-case for me yet.

`clean-code.md` forbids building for a caller who does not exist, and its own test for the
difference is whether something is _already_ being worked around. Nothing is: there is no
emergency fund on the budget today, so nothing is currently mis-asking. A two-number target
touches `Target`, `LEGAL`, `parseTarget`, `demand.ts`, the drawer and every stored blob — the
wrong thing to build on a use case that is anticipated rather than felt.

Recorded here so that when it does become real, the analysis is not redone from scratch. See
**Follow-ups**.

### D2 — Meanwhile, stop the drawer recommending it for that case

The hint frozen an hour earlier reads:

```
( ) Keep this amount available
    Spending it asks for it back — a car-repair or medical fund
```

It names as its example precisely the use case for which its behaviour has now been shown wrong.
The sentence is true and the recommendation is not, which is worse than saying nothing: it steers
someone into the shape that will distort their month.

It becomes:

```
( ) Keep this amount available
    Spending it asks that money back the same month, all at once
```

**The example goes and no replacement is invented.** `save` keeps its examples, and the resulting
asymmetry is honest rather than untidy — we know what a goal is for, and what a deadline-free
floor is _well_ suited to is exactly the question left open above. Naming a second plausible-
sounding example to restore symmetry would be guessing in the UI.

Stating the sharp edge is also what would have prevented this: "all at once" at the point of
choice is the fact that decides between the two jobs for anything that gets spent.

## Acceptance criteria

- [x] The `balance` hint reads `Spending it asks that money back the same month, all at once`, at
      both `by` and `none`, and names no use case.
- [x] The `save` hint is unchanged, examples included.
- [x] No behaviour changes at all: `balance` + `none` still asks `amount − available` this month
      (`target-refill-basis` D3 intact) and still counts toward "still needed" — the probe in
      Context measures the shipped behaviour and it is the same after this change. 4024 unit
      tests, typecheck and lint unchanged and passing.

## Changes from original plan

| #   | Change                                                                          | Why |
| --- | ------------------------------------------------------------------------------- | --- |
|     | None. The copy shipped as specified, and D1's decision is to ship nothing else. |     |

## Follow-ups (new work — not amendments to this frozen spec)

- **The two-number target**, when a real fund needs one. What is written above is the analysis, not
  a design: it establishes _what_ is missing (a rate plus a ceiling, on one target) and _why_ no
  existing pairing covers it. Still open — how the second number is stored on a JSONB target
  parsed by one `parseTarget`, what it does to `LEGAL`, whether the ceiling suppresses the ask or
  retires the target, and what the drawer asks for. That is a `/shape-spec` job.
- **What a deadline-free floor is genuinely well suited to.** D2 removed its example rather than
  guess a replacement, so the drawer currently describes that job without recommending it for
  anything. If the answer turns out to be "nothing a goal or a rebuilt fund does not do better",
  that is a case for retiring the pairing, not for finding it a use case.

> **Frozen.** This folder is the as-built record. Reference it, or open a new delta-spec for
> further change — do not re-open it as a living control plane.
