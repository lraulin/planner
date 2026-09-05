# References for Bill due dates and lead time

## Governing specs

### `agent-os/specs/2026-08-23-2313-one-budget/`

- **Relationship:** Supersedes **D2, in part.**
- **What changes:** only the claim that next-due derived from charge history means "a missed or
  early charge self-corrects". It does not — a walk from the last posting absorbs the deviation
  permanently. Measured: 16 of 24 rent occurrences falsely flagged.
- **What carries forward:** the rest of D2 — bill cadence wins, Actual's `RecurConfig` stays
  retired, no stored `next_date` cursor, no skip, no Post-now/Discover. Occurrences remain
  derived; this spec changes what they are derived _from_, not whether they are stored.
- **Also update:** `docs/actual-budget/README.md` lines 75-77, which states the divergence in the
  same wrong terms.
- **Note:** this spec is still `Status: active` (reopened 2026-08-24). It is nonetheless treated
  as a superseded governing record rather than amended, because several frozen delta specs
  already point at its decisions as written.

### `agent-os/specs/2026-08-25-0901-bill-next-charge/`

- **Relationship:** Supersedes **D1/D2, narrowed.**
- **Relevant decisions:** D1 put a `DateKeyCell` on the Next charge column; D2 made the write
  `anchorDate`. Both stand for bills with no declared due day. D5 of this spec makes the cell
  derived and read-only once a due day exists, because two writable sources for one date is how
  `anchorDate` acquired three meanings. **D4 is untouched** — `nextChargeWriteError` and its
  payee-claim lookup still govern undeclared bills.

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Extends. This is the founding cadence spec, and `commitments.ts` still cites
  it for "flags, never applies".
- **Relevant decisions:** months not days for calendar-anchored bills; the ±12% cadence
  tolerance; declaration is always a confirmation. D6 of this spec (suggest the lead, never
  apply it) follows the same rule.
- **Its own follow-up is this spec's mandate:** _"Reconciling a forecast against the charge that
  arrives. The upcoming panel projects and nothing marks a bill paid or late. That needs a notion
  of a bill instance, which is its own design."_ Answered here by derivation, not by rows.

### `agent-os/specs/2026-09-05-1200-finances-envelope-workflow/`

- **Relationship:** Extends (frozen the same day as this spec was shaped).
- **Relevant decisions:** "Recurring discovery and Still active review live here [Bills]. Passed
  expected dates ask for review, never assert missed payment." That wording stands; this spec
  makes the expected date correct so the review is asked far less often. The Before payday / On
  payday cue and the Due-soon 14-day link are unchanged.

### `agent-os/specs/2026-08-28-1000-ynab-target-engine/`

- **Relationship:** Extends.
- **Relevant decisions:** the target engine reads a bill's recurrence through `ScheduleBill`
  (`budget/targets/cadence.ts:38`), anchored on `expectedKey ?? nextDueKey`. Because `billAnchor`
  keeps its signature, the engine inherits the corrected date with no edit. Its `Cadence` type
  already models `{ unit: "month"; day: number }` for ordinary envelope targets — the same
  day-of-month concept the bill facet was missing.

### `agent-os/specs/2026-08-22-2124-actual-schedules/` (retired)

- **Relationship:** Cautionary reference, not a dependency.
- **Why it matters:** Actual's Schedules — `RecurConfig`, a stored `next_date` cursor, and
  `skipWeekend` + solve mode — was built, frozen, and then deleted wholesale by one-budget D1.
  Its `skipWeekend` machinery is the obvious-looking answer to "the bank posts on a business
  day". Do not reintroduce it: lead days plus a 7-day grace covers the observed drift, and the
  removal was deliberate.

## Similar implementations to borrow from

### Occurrence generation without accumulating clamp error

- **Location:** `src/lib/finances/budget/targets/cadence.ts:77` (`occurrenceDatesInMonth`)
- **Relevance:** already solves the exact arithmetic hazard the due-day series has — a Jan 31
  anchor stepped a month at a time degrades to Feb 28, Mar 28, Apr 28.
- **Key pattern:** `at(k) = shiftDateKeyMonths(anchor, k * cadence.n)` — always measured from the
  anchor, never from the previous step; estimate `k` then settle it with bounded walks.

### The anchor the new branch slots into

- **Location:** `src/lib/finances/commitments.ts:187` (`billAnchor`), and its callers
  `budget/queries.ts:577` (`loadBillAnchors`) and `:617` (`loadBillSnapshots`)
- **Relevance:** the single seam. Its doc comment already documents the `anchorDate` ambiguity
  this spec resolves.

### The write path a new column threads through

- **Location:** `src/lib/finances/mutations.ts:836` (validation), `:981` and `:1033` (the two
  writes)
- **Key patterns:** only fields supplied are written (a blanket write once silently cleared a
  declared amount); validate in lib as well as in the CHECK, because a constraint violation
  surfaces as a database error the user cannot act on.

### Per-bill charge history, already loaded

- **Location:** `src/lib/finances/dashboardQueries.ts:288` (`loadBillForecast`) builds
  `chargesByName` keyed by envelope id; `src/lib/finances/billLastCharge.ts:17`
  (`lastChargeByEnvelope`) joins through the **payee claim**, not the transaction's
  `budget_category_id`.
- **Relevance:** `suggestLeadDays` needs charge dates, and the Bills page already has them. The
  payee-claim join is the correct source — a hand-recategorised charge must not move a due date.

### Cadence-relative tolerance, stated as a ratio

- **Location:** `src/lib/finances/commitments.ts:266` (`OVERLAP_RATIO`, being deleted) and
  `recurringBills.ts:170` (`CADENCE_TOLERANCE`)
- **Relevance:** prior art for expressing a window as a fraction of a cadence rather than a fixed
  number of days. Nearest-occurrence matching needs no such constant at all, which is the point.

## Evidence gathered during shaping

Queries run against the live local database on 2026-09-05:

- `finance_budget_categories` where `kind='bill'` — Rent, SMECO, Geico, 1Password, Taylor Gas;
  `due_day` null on every one of them.
- 24 charges on the `Rent` payee claim, 2024-09-26 through 2026-08-26.
- Replays of both rules over that series (scratch scripts, not committed): current rule 16/24
  flagged over 42 days; proposed rule 24/24 matched, 0/24 flagged at grace 7.
- Dead-code inventory: repo-wide ripgrep over `src/`, `scripts/`, `tools/`, separating definition
  sites, test references and production callers. No dead-export tooling exists in this repo.
