# "The job" names what happens after you spend it

**Status: frozen / complete** (2026-09-07)
Spec folder: `agent-os/specs/2026-09-07-1210-the-job-names-what-happens-after/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-09-07-0804-one-time-savings-goal/` **D1**, the radio
  wording only — "Save this amount in total, then it's done" and the claim that **"in total"** is
  the load-bearing phrase. It is not; see D1 below. Everything else in that D1 stands: `save` is a
  fourth behaviour, legal with `by` and `none`, and `LEGAL` remains the only copy of the matrix.
  `summarize()` is untouched.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` **D7** — one target, one form,
  cadence first and then the job as a sentence. The form's shape is unchanged; only what the
  sentences say, and a second line under each.
- **Extends:** `agent-os/specs/2026-09-07-1140-deadline-free-goal-never-asks/` — that delta made
  the deadline-free arm behave correctly; this one makes the _choice_ legible. No behaviour
  changes here at all.

Checked and unaffected: `demand.ts`, `indicator.ts`, `plan.ts` and every test over them. This is
a copy and layout change in one component.

## Context

Reported by Lee, choosing a target for a trip to visit his in-laws in Mexico:

> "The job / • Have this amount available by a month / • Save this amount in total, then it's
> done". For example, for saving up enough money to visit my in-laws in Mexico... I think it
> should be the second one, but the wording doesn't make it clear.

He then reasoned his way through both options and back again in a single paragraph — treating it
as an emergency fund to refill, rejecting that because he needs it ready by a date, and landing
where he started. **A choice that takes a paragraph of reasoning to make is a labelling failure**,
not a user failure, and the paragraph names the axis the labels do not.

### What the labels actually say

With **How often** set to "By a month", the two jobs read:

```
The job
  ( ) Have this amount available by a month
  ( ) Save this amount in total, then it's done
```

The first mentions a month; the second does not. So they read as **dated versus undated** — which
is not the choice. The date was already chosen one control above, and it applies to _either_ job:
`save` + `by` is legal and is exactly what Lee wanted. The one control that is not the deadline is
the one that looks like it.

The real difference is what happens **after the money is spent**:

| Job       | Spend it and…                                       |
| --------- | --------------------------------------------------- |
| `balance` | it asks for the money back, ready for the next time |
| `save`    | the goal is complete and it never asks again        |

That is the sentence Lee wrote himself — "save up an amount of money, then use it for a purpose,
then I'll be done" — and the one the radio never says.

**Why it matters for this envelope rather than being cosmetic.** Picking `balance` for the Mexico
trip would have the envelope demand the full amount again the moment the trip is paid for, for a
trip that has not been planned yet. Picking `save` leaves it Fully Spent until he decides there is
a next one. The wrong pick is not a mislabelled row; it is a fund that nags every month for a year.

## Decisions

### D1 — The label names the job; a second line names what spending does

`sentence()` becomes `job()`, returning a **label** and a **hint**, and the radio renders both.
The hint is where the distinction that actually decides the choice lives.

```
The job
  ( ) Keep this amount available
      Spending it asks for it back — a car-repair or medical fund
  ( ) Save this amount, then spend it
      Spending it completes the goal — a trip, a down payment
```

Three things change and each is load-bearing:

1. **Neither label mentions the deadline any more.** It is set in "How often" directly above and
   applies to both, so repeating it on one option and not the other was what made the pair read
   as a timing choice. This is the actual fix.
2. **The labels are parallel** — same length, same shape, differing in the verb. "Keep" against
   "Save … then spend".
3. **The hints contrast on one clause**: "asks for it back" against "completes the goal". Read
   together they are the table above.

The concrete examples are YNAB's device ("Use for: bills, subscriptions, saving over time"), which
Lee quoted approvingly when this behaviour was first specified. They are what makes the choice
takeable at a glance rather than by reasoning.

**"In total" was not load-bearing after all.** `one-time-savings-goal` D1 argued that phrase named
the measure — everything put in, rather than what is sitting there. It is accurate and it did not
work: it describes the _arithmetic_, and nobody picking a savings target is asking which basis the
engine measures. The hint answers the question actually being asked, which is what happens to my
envelope after I spend this money. The basis is the implementation of that answer, not the answer.

`summarize()` keeps "in total" — a saved target's one-line summary has no sibling to be told apart
from, and there the phrase does distinguish it from "Have $450.00 available".

### D2 — Every job gets a hint, including the ones nobody complained about

`add` and `upTo` are not confusing today, but leaving two options with an explanatory line and two
without makes the pair with the line look like the special case. Their **labels are left exactly as they were** — only `balance` and `save` are rewritten,
because only they were reported. Uniform structure costs three short hints:

| Cadence          | Job       | Label                           | Hint                                                              |
| ---------------- | --------- | ------------------------------- | ----------------------------------------------------------------- |
| `week` / `month` | `add`     | _unchanged_                     | On top of whatever is already there                               |
| `week` / `month` | `upTo`    | _unchanged_                     | What is left over counts toward it, so you top up the difference  |
| `year`           | `upTo`    | _unchanged_                     | Saves toward it a month at a time, then starts over for next year |
| `by` / `none`    | `balance` | Keep this amount available      | Spending it asks for it back — a car-repair or medical fund       |
| `by` / `none`    | `save`    | Save this amount, then spend it | Spending it completes the goal — a trip, a down payment           |

`by` and `none` share their strings, which is the point of D1: the cadence is not part of the job.

### D3 — No behaviour changes, and the drawer stays one form

No change to `demand.ts`, `indicator.ts`, `plan.ts`, `types.ts` or `LEGAL`. `behaviorsFor` still
derives the options from `isLegalPairing`, so the matrix stays in one place. The radio becomes a
two-line item; no new control, no disclosure, no help popover.

## Acceptance criteria

Checked in the drawer against the seeded envelope, at every cadence. No target was saved — the
change is copy and layout, and nothing was written to verify it.

- [x] With **How often** = "By a month", neither job label mentions a month, and both jobs are
      selectable. The date sits in its own **By month** field above them, so the drawer no longer
      implies that a deadline rules `save` out — the confusion that opened this spec.
- [x] The two jobs under `by` and under `none` render identical label and hint text.
- [x] Each job shows a hint, at all five cadences — no option is left bare.
- [x] `year` still offers exactly one job, and `week` / `month` still offer `add` and `upTo` with
      their original labels; the legality matrix is untouched.
- [x] No behaviour moved: 4024 unit tests, 1021 integration tests, typecheck, lint, and
      `npm run smoke` over all 62 routes, all unchanged and passing.
- [x] `summarize()` is untouched: a stored goal still reads `Save $450.00 in total (no deadline)`.

## Changes from original plan

| #   | Change                                                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `add` and `upTo` keep their existing **labels**; only their hints are new. D2's table said all five labels were in play. | Only `balance` and `save` were reported as unclear. Rewriting the other three would have been unrequested churn on wording nobody has stumbled over, and the hint alone is enough to make the set look uniform. "Add this amount each weekday" is odd phrasing — it reads as Monday-to-Friday rather than "the weekday you picked above" — but that is a separate observation, noted below rather than fixed here. |

## Follow-ups (new work — not amendments to this frozen spec)

- **"Add this amount each weekday" / "Have this amount available each weekday"** reads as
  Monday-to-Friday when it means "on the weekday chosen above". Noticed while writing the hints
  and deliberately left alone — nobody has reported it, and it was outside what was asked. Worth a
  line of its own if it ever does trip someone.

> **Frozen.** This folder is the as-built record. Reference it, or open a new delta-spec for
> further change — do not re-open it as a living control plane.
