# References for Commitments — categories, aliases, and real cadences

## Governing specs

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends; supersedes its cadence-in-months decision for day-cycle charges only.
- **Carries forward:** D0 the two tiers and the deliberate absence of a third; D2 identity split
  from matching (`name` + `matchers`), which is what makes an alias merge possible at all;
  D3 a merchant string belongs to at most one commitment across both tables, enforced in the
  mutation — the new add-matchers path is bound by it; D4 no either/or logic on spend groups,
  which is why the overlap warning is bills-only; D8 propose, never apply; D10 one page, two
  sections built on the shared `DataGrid`.
- **Changes:** its `cadenceMonths` reasoning ("semi-annual means March and September, not every
  182.5 days") stays true for calendar-anchored bills and is not the whole story for a vendor
  counting days between shipments.

### `agent-os/specs/2026-08-18-2058-commitments-clarity/`

- **Relationship:** Extends; supersedes **D5 only**.
- **Carries forward:** D1 `set_aside` is gone and `status` is the whole answer to "is it
  budgeted"; D3 the review list proposes and you name it before it commits — the new bill draft
  extends that editor rather than replacing it; D4 dismissed rows live under Review, which moves
  with Review to the foot of the page.
- **Changes:** D5 deferred "merging two existing spend groups… until it actually bites". The
  half that bit is joining an _unclaimed_ merchant to an _existing_ bill. Merging two rows that
  both already exist stays deferred.

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Ancestor, already partly superseded by the parent spec.
- **Relevant:** the propose-never-apply rule and the reasoning behind `scheduled` as a separate
  axis from cost — unchanged here.

## Similar implementations to borrow from

### The spend draft's "add to existing group"

- **Location:** `src/components/finances/commitments/ReviewList.tsx` — `SpendDraft`
- **Relevance:** exactly the control the bill draft needs, one tier over.
- **Key patterns:** new-vs-existing radio swapping the commit label to "Add to Pizza"; the
  target's matchers patched rather than a row inserted.

### `renameRecurringBill` / `renameRecurringSpend`

- **Location:** `src/lib/finances/mutations.ts`
- **Relevance:** the precedent for touching one column directly rather than insert-then-delete,
  because the old row still holds the matchers and would trip exclusivity.

### `reclassifyTransactions` and `changedRows`

- **Location:** `src/lib/finances/mutations.ts`, `src/lib/finances/classify/reclassify.ts`
- **Relevance:** the whole-history idempotent pass that makes D4's category propagation cheap —
  it already writes only rows whose plan actually changed.

### `recurringSpendRate` and `periodIndex`

- **Location:** `src/lib/finances/commitments.ts`
- **Relevance:** the tier-2 detector must measure the same fixed, non-rolling buckets the rate
  does, or the candidate list and the rate it proposes would disagree about which week a charge
  fell in.

### `effectiveMerchant` and `rules.ts`

- **Location:** `src/lib/finances/analytics.ts:112`, `src/lib/finances/classify/rules.ts:91`
- **Relevance:** Walmart's two spellings already fold to one merchant here. Confirms the gap is
  in detection, not normalisation — and is the reason a `rules.ts` entry is _not_ the fix.

### The Accounts page's bank URL

- **Location:** `src/app/finances/accounts/`, `src/lib/finances/accountUrl.ts`
- **Relevance:** the existing treatment of a user-supplied URL on a finance record — check it
  before writing a second normaliser for schemes and hostnames.
