# References for Envelope sections

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Extends — the section layout and the `kind` column this spec widens.
- **Relevant decisions:** D1 (a bill is an envelope, `kind` discriminator), D6 as revised
  (three sections, derived not user structure), D7 (income has no Assigned or Balance).
- Its `shape.md` records this work as the open question "sections vs. groups".

### `agent-os/specs/2026-08-22-1948-zero-based-budget/`

- **Relationship:** Supersedes the placement of `is_income` on the group.
- **Why it changes:** it was put there "as Actual does", which was the right default when the
  budget was a parallel system being copied. Now that a bill's section already lives on the
  envelope, keeping income's on the group is what makes the same question have two answers.

### `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/`

- **Relationship:** Supersedes, narrowly — "groups are arbitrary-depth organisational
  containers" was true except for `is_income`. After this it is true without exception.

## Similar implementations

### The bill facet on `finance_budget_categories`

- **Location:** `src/db/schema.ts`, `finance_budget_categories_bill_facet` CHECK.
- **Relevance:** the same pattern one step earlier — a discriminator plus CHECKs keeping the
  other kinds' columns null. The bill-facet CHECK only needs `= 'envelope'` widened to
  `<> 'bill'`.

### `src/lib/finances/budget/cutover.ts`

- **Relevance:** the guarded, previewed, re-runnable cutover shape this repo uses for data
  moves. This migration is a pure backfill and needs no preview, but the receipt habit —
  record the figures before, diff them after — still applies.
