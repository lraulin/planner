# Unscheduled bills — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Separate two facts the parent spec treated as one: **how much a bill costs over a period**, and
**whether anyone can say when it will arrive**. Propane has the first and not the second.

One boolean, `scheduled`, on the existing declaration. Everything the parent spec built —
the table, the review-list suppression, the baseline accrual, the set-aside column — works
unchanged, because all of it reads the annual figure rather than the calendar.

### Out of scope

- **Detecting or suggesting unscheduled bills.** Explicitly ruled out by the user: "we don't
  want to assume other things are bills just because the same names pop up." VCA and MedStar
  look identical to propane in the data and are not the same thing.
- **Annualizing a short history into a rate.** Six months of vet bills annualize to $3,024,
  which is a wrong number wearing the costume of a measurement. The user states the yearly
  cost; history at most seeds a suggestion they can overwrite.
- **Predicting a delivery from tank behaviour, weather, or usage.** Interesting, and not this.
- **Changing anything about Geico's path.** The scheduled case works and shipped.

## Decisions

- **A boolean, not a nullable cadence.** `cadence_months = 12, expected_cents = $500,
scheduled = false` already reads as "about $500 a year". Nulling the cadence would have made
  `expected_cents` mean an annual total in one case and a per-charge amount in the other, and a
  column with two meanings is a bug waiting for a reader in six months.
- **No forecast beats a guessed forecast.** The parent spec's Upcoming panel is honest only
  because a projection from a real cadence is defensible. Projecting a propane delivery is not,
  and a date on screen reads as knowledge whatever the subtitle says.
- **Unscheduled charges are bills, but unlevelled.** They belong on the bills side of the
  fixed/variable split — propane is not discretionary. They must not be spread across the
  declared period, because two deliveries in one cold winter would each claim twelve months and
  the chart would count the money twice.
- **The user states the amount.** Same principle as the cadence declaration in the parent spec:
  where a statistic cannot know and a person can, ask the person.

## Context

- **Visuals:** None.
- **References:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` (parent, frozen the
  same day). Real data: three Taylor Gas charges spanning 2024-01-23 to 2025-10-24.
- **Product alignment:** A correction inside a shipped Finances feature, not new territory.

## Standards Applied

Same set as the parent spec, and for the same reasons — see its `standards.md`. The one that
does real work here is **testing**: the double-counting hazard in the cash-flow chart is
invisible to inspection and is exactly the kind of plausible-looking wrong answer that needs a
test naming it.
