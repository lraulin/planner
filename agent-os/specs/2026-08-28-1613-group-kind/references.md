# References for A group belongs to a section

## Governing specs

### `agent-os/specs/2026-08-28-1527-inline-budget-structure/`

- **Relationship:** Extends. This is the correction its implementation exposed.
- **Relevant decisions:** D3 deletes `BudgetStructureDrawer`, which was the only surface that
  listed groups directly and therefore the only place an empty group was reachable. Its
  acceptance criterion "Deleting a non-empty group is disabled **with the reason**" is
  unreachable without this spec, because a group vanishes the moment it becomes deletable.

### `agent-os/specs/2026-08-24-0930-envelope-sections/`

- **Relationship:** Extends, and **supersedes one rule**.
- **Carries forward:** `kind` (`income | spending | bill | savings`) is the section; groups
  are optional organisational containers inside a section; `group_id` stays nullable so an
  envelope can sit at a section root.
- **Superseded:** D1's "a group whose envelopes span sections is prevented by the UI, not the
  schema." The schema states it now.

### `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`

- **Relationship:** Extends; **supersedes** only its derived-section rule.
- **Carries forward:** arbitrary depth, recursive totals, empty-only group delete, groups hold
  no money.
- **Superseded:** a group's section being derived from its members. A child group must now
  match its parent's `kind`.

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Untouched, listed so it is not disturbed. D5 defines the presets, whose
  groups this spec removes; the **envelopes** they seed and the opinion behind which preset is
  recommended are unchanged.

## Similar implementations

### The derived section, and its two workarounds

- **Location:** `src/lib/finances/budget/hierarchy.ts` — `groupPageSection` (`:221`),
  `descendantEnvelopeIds` (`:82`), `nestedBudgetGridRows`' zero-count drop (`:198`),
  `resolveBudgetDrop`'s section check (`:255`), `moveDestinations` (added by
  `2026-08-28-1527`).
- **Relevance:** everything this spec replaces with one column comparison. Read before
  deleting `groupPageSection`.

### The lone-root-header rule

- **Location:** `src/lib/finances/budget/rows.ts` — `sectionGridRows` (`:186`).
- **Relevance:** it exists to hide the seeded chrome groups. With D5 there is nothing left to
  hide and the rule would start hiding real groups, so it goes.

### The seeded chrome groups

- **Location:** `src/lib/finances/budget/presets.ts` — `MINIMAL` (`:38`), `DETAILED`.
- **Relevance:** `MINIMAL` seeds one group holding three different sections at once. It is the
  only mixed group that exists and the reason the migration dissolves rather than reassigns.

### The guard being replaced

- **Location:** `src/lib/finances/budget/mutations.ts` — `updateBudgetCategory`'s destination
  check (`:588-604`), `createCategoryGroup` (`:518`), `createBudgetCategory` (`:541`).
- **Relevance:** "Income, spending and savings envelopes cannot share a branch" becomes kind
  equality against the group's own column.
