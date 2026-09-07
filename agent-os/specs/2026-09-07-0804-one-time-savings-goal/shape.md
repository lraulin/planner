# A goal you finish — Shaping Notes

**Status: frozen / complete** (2026-09-07)

## Scope

A fourth target behaviour, `save`, for money that is saved once toward a specific purpose and is
**finished by being spent** — the shape Lee's $100,000 House down-payment envelope actually is.
It measures cumulative contribution since the target started, so a purposeful spend leaves it met
while taking the money back out re-opens the ask.

In scope:

- The behaviour and its two cadences (`by`, `none`), in the one legality table.
- The contribution basis, and the fold that supplies it — no schema change, no new query.
- The indicator: the bar and On Track on the same basis as the ask, and the met copy.
- The drawer's "The job" wording, which is where the distinction is either understood or missed.

### Out of scope

- **Changing `balance` or `upTo`.** Both are correct for what they are for. This spec supersedes
  no decision; it adds a third answer.
- **A stored "done" state** — no `completed_at`, no archive table, no new indicator rung. D4.
- **Automatic migration** of existing `balance` targets. D5.
- **Retiring a met goal** — auto-clearing the target, hiding or archiving the envelope. The
  envelope still holds real money until it is spent, and Fully Spent already says the rest.
- **The sweep** and the "quasi-account" earmarked-savings work sketched at
  `agent-os/product/roadmap.md:1243-1251`. That is about how savings gets _funded_ (after a pay
  period is survived, not out of the paycheck); this is about what a savings envelope _asks for_.
  They meet later; neither blocks the other.
- **`add` + `year` / `add` + `by`**, which `targets/types.ts:78-80` excludes because "nothing
  stores assigned since the cycle started". This spec stores something adjacent, and it would be
  easy to conclude those pairings are now cheap. They are not in scope: nobody has asked for them,
  and building for a caller who does not exist is the speculative generality the standards forbid.

## Decisions

Full statements in `plan.md`. The four that were Lee's to make, and what he chose:

1. **What re-opens a met goal** — taking the money back out. Spending never does. The basis is
   cumulative _contribution_, signed, so both halves fall out of one formula rather than two rules.
2. **The wording** — "Save this amount in total, then it's done", over "Save up this amount once"
   and "Saving up for something specific". "In total" is the phrase that names the measure.
3. **What a met goal shows** — green "Goal met — $100,000.00 saved" on the existing `funded`
   state, over a distinct state and icon, and over adding a retire action. Nothing new in the
   ladder.
4. **Existing `balance` targets** — Lee re-picks the job himself, over auto-converting savings
   envelopes. A floor and a finished goal are indistinguishable from the outside.

## Context

- **Visuals:** None. This is a model correction.
- **The question this answers:** Lee's, on 2026-09-06, immediately after `pile-spent-is-not-a-raid`
  was verified — quoted in full in `plan.md`. That spec's Follow-ups already named the gap and the
  shape of the answer, including that the ledger makes it summable with no schema change; this
  spec confirmed that reading against the code before designing on top of it.
- **References:** `references.md`.
- **Product alignment:** `agent-os/product/roadmap.md:1213-1215` closes the previous entry with
  "…and is the next spec", so the roadmap already earmarks this work. It sits in Phase 3 →
  Financial planning.

### Why the obvious fix does not work

Worth keeping, because it is the thing a later reader will re-propose. Putting a one-time goal on
the carry-in basis — the fix that worked for piles — leaves $95,000 carried in against a $100,000
cap, so it asks $5,000 every month forever. Carry-in works for a pile because a new cycle starts
and the pile has to be rebuilt. A one-time goal has no next cycle, so **no month-local basis can
answer it**. That is why this needs history and a third basis rather than a fourth arm on an
existing one.

### What the reference implementations say

`docs/actual-budget/README.md:33` records that the target engine is YNAB's, not Actual's. Neither
reference has this shape: Actual's `by` template repeats or floors, and YNAB's balance targets
refill. So this is new design rather than a port, and `ynab-wins-except-credit-cards` does not
decide it. Stated here because the default in this repo is to prefer the reference's semantics,
and this is a place where there are none to prefer.

## Standards Applied

See `standards.md` for the pinned list and why each applies.
