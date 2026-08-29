# Target Snooze — Shaping Notes

**Status: active**

## Scope

A per-envelope, per-month switch that silences one target's underfunded alert. Storage on the
allocation row, the ask zeroed at `neededAssigned`, a dedicated `snoozed` indicator state with a
Zz icon, and controls in the budget inspector and the Available row menu.

Two motivating cases, both from Lee:

1. **Done for the month.** Pizza has a $25/week target. The last pizza is bought, there is money
   left, and it gets moved elsewhere — so the envelope goes yellow for money that is deliberately
   gone. There was no way to say _done_ short of leaving the money parked.
2. **Deliberately deferred.** A self-imposed savings goal you still intend to hit, set aside for a
   month because something else is a higher priority: "yes, I intended that, but we're setting that
   aside for now because there are higher priorities."

The second case is a _pile_-family target and the first a _period_ refill. The chosen seam sits
above both families, so one rule covers them — which is why both are named in the acceptance
criteria rather than only the one that prompted the request.

### Out of scope

- Snoozing a group or the whole budget
- A snooze spanning more than one month
- Snooze history or audit lines in the month notes
- Dashboard and Register surfacing
- Any change to the two target families, to envelope arithmetic, or to `goalCents`
- Credit-card payment categories (no such concept here — see plan D7)

## Decisions

See `plan.md` D1–D11 for the full statements. The ones that took the most argument:

- **Where the flag lives.** The allocation row, not a `snoozedMonth` column on the category. The
  allocation row is already the per-(category, month) record and already sparse, so automatic
  expiry is a property of the storage rather than a job that has to run.
- **Where the behaviour lands.** One line in `neededAssigned`, which the indicator, the underfunded
  total, and every demand-driven auto-assign option already share. Putting it anywhere else would
  create the second demand that `budget-funding-indicators` D3 forbids.
- **The overspend floor survives the snooze.** `neededAssigned` keeps its
  `assignedToZeroBalance` term, so a snoozed envelope that is overspent stays red and still gets
  covered. Snooze silences an ask; it never hides money already spent.
- **Reduce Overfunding harvesting a snoozed envelope is the feature, not a side effect.**
- **Bills are excluded, and the exclusion was checked rather than assumed.** See below.

## The bill question, and how it was settled

The requested product spec carried a "Scheduled Transaction Override" rule: an upcoming scheduled
transaction exceeding the assigned amount overrides the snooze and forces the envelope yellow.

There are no scheduled transactions in this codebase — `finance_schedules` was collapsed into the
bill facet on an envelope by `one-budget`, and a next charge is _derived from imported charge
history_, not stored as a future row. So the rule had no referent, and the real question was
whether bills should be snoozeable at all.

Lee's first instinct covered the sinking case ("I'd rather just let it stay orange to remind me I
need to put money") but raised a harder one: **variable bills** — electricity, water, sewer — whose
amount differs every month, where the charge might land _under_ the target and the leftover then be
moved. Would that show underfunded?

Traced rather than assumed, for a $150 estimate charged $120 on Aug 10:

- `billAnchor` sets `expectedKey = nextDueDate(lastCharge, cadence)` → Sept 10 (`commitments.ts:214`)
- `scheduleAnchor` reads `expectedKey ?? nextDueKey` (`cadence.ts:57`)
- `outstandingCharges(bill, August)` → 0, so `periodCapCents` → **$0**
- moving the $30 out leaves `needed = max(0, assignedToZeroBalance) = $120` against $120 assigned

**Gap $0. No yellow.** The case is already handled, by design — `demand.ts:84` says outstanding
charges rather than the calendar is what "stops a paid one".

That left one genuine gap: the window between receiving a notice and the charge posting, where the
cap is still the full estimate. Lee chose to accept it rather than open a fourth way to quiet a
bill. Recorded in plan D6 as the stated cost, not omitted.

## Context

- **Visuals:** None supplied. The requested spec described the controls in prose; no mockups.
- **References:** See `references.md`.
- **Product alignment:** Phase 3 → Financial planning. Snooze was not on the roadmap, but had been
  named and deferred three times across two frozen specs, both times as scope-fencing rather than
  as an objection. Nearest roadmap neighbour is "Shortfall attribution" (guided cancel/skip from a
  red envelope).
- **Source of semantics:** YNAB, per `docs/actual-budget/README.md` — the target engine is YNAB's,
  not Actual's, and Actual has no equivalent of Snooze. Envelope arithmetic stays Actual-derived
  and is untouched here.

## Standards applied

Paths and reasons only — see `standards.md`. Nothing is copied.
