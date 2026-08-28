# A group belongs to a section — Shaping Notes

**Status: active**

## Scope

Give `finance_category_groups` a `kind`, so a group states which of the four budget tables it
lives in instead of having it inferred from whatever is inside it.

- `kind` is an `EnvelopeKind`, not null. A group is in exactly one table.
- An envelope's kind must match its group's; a child group's must match its parent's.
- Changing an envelope's section while it is in a group moves it to that section's root.
- Empty groups render. Groups whose members disagree — only the seeded chrome ones — are
  dissolved by the migration.
- The presets stop seeding groups; `groupPageSection` and the lone-root-header rule go away.

### Out of scope

- Removing nesting. The user's observation that separate envelope kinds removed the reason
  YNAB needed nested groups is probably right and is a future spec, not this one.
- Group `hidden`. Still no UI, still not getting one here.
- Budget arithmetic. No figure moves.

## Decisions

Full statements in `plan.md` D1–D7. The three that shaped the rest:

- **Four values, not three.** The page renders four tables and Bills is one of them. Tying a
  group to the three-value page section would leave a bill group and a regular-spending group
  indistinguishable, which is precisely the distinction the user wants groups for.
- **A section change evicts to the root rather than being refused.** The user asked for the
  section change; the group cannot follow. Refusing would make Change section dead-end with
  no path forward, and `navigation.md` would then require explaining why in a menu that has no
  room for it. Moving to the section root is what they would have to do by hand anyway.
- **Dissolve, do not reassign.** The only mixed groups that exist are the seeded `Income` and
  `Spending` ones, which are invisible today (`sectionGridRows` hides a lone root header) and
  say nothing the section headings do not. Picking a winning kind would preserve a group
  nobody has ever seen and leave the evicted rows to be tidied by hand.

### Question the shaping settled

**Is this a new spec or a decision inside `2026-08-28-1527-inline-budget-structure`?**
A new spec. It changes the schema, supersedes named group semantics in two earlier specs, and
has a data migration — `clean-code.md` says a model correction gets a spec that records what
it supersedes. It is nonetheless implemented in the same session that found it, because the
drawer is already deleted on `master` and stopping at the saved spec would leave the budget
page unable to delete a group at all.

## Context

- **How it was found:** implementing `2026-08-28-1527-inline-budget-structure` Task 6 in a
  browser. Created a bill in a new group, deleted the bill, and the group vanished from the
  page while surviving in the database.
- **The user's framing:** they only use groups for bills, gave them arbitrary nesting because
  YNAB forced groups to stand in for sections, and separate envelope kinds have since removed
  that need. That is what makes four values right and makes the seeded chrome groups
  disposable.
- **References:** see `references.md`.

## Standards Applied

See `standards.md`. The ones that decided something: `development/clean-code` (the whole
premise — a fact recomputed because nothing stores it), `development/testing` (the cross-table
rule is a mutation guard, so it is an integration test with a second user),
`components/navigation` (why a section change evicts instead of refusing).
