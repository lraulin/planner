# References — Declared recurring bills

## Governing specs

### `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/`

- **Relationship:** Extends. **Supersedes** its **One-offs** decision only — the row
  "Per-transaction `exclude_from_baseline` flag **and** an optional `event_label`; candidates
  auto-suggested, never auto-applied" gains a third disposition.
- **Carries forward unchanged:**
  - _Suggestions propose, the user disposes._ The frozen spec rejected auto-detection alone
    precisely because "an annual insurance premium is a genuine recurring cost"
    (`shape.md:46`). This work is the other half of that sentence, not a reversal of it.
  - _Baseline burn and one-off spend are always two numbers, never blended._ The set-aside
    figure is a third number with its own label, not a blend of the first two.
  - _Derived vs user: a computed value and a user override that wins._ A declared cadence
    beats a detected one for the same reason `flow_override` beats `derived_flow`.
  - Charts stay hand-rolled SVG, no new dependency.
- **Explicitly answered here:** the frozen spec's own follow-up list does not name this gap —
  it was found in use, not in planning.

## Code the implementation must read before changing

### Recurring detection and its two hard limits

- **Location:** `src/lib/finances/analytics.ts:881–978`
- **Relevance:** `MIN_RECURRING_CHARGES = 6` and `MAX_CADENCE_DAYS = 100` are jointly why a
  semi-annual bill can never be detected: it is over the day cap, and would need three years
  of history to reach six charges. These constants stay as they are — they govern what the
  panel asserts unaided. The new looser heuristic is a separate function with a separate job.
- **Key pattern:** detection by amount variance rather than by category
  (`RECURRING_VARIANCE_RATIO`), which the candidate finder reuses at the same ratio.

### The amortization that already exists

- **Location:** `allocateAcross` (`analytics.ts:452`) and its caller in `cashFlow`
  (`analytics.ts:495–525`)
- **Relevance:** the levelling machinery is already built and already correct — shares are
  normalised over the buckets actually present, so a charge at the window edge does not leak
  money. This work supplies it a longer span, it does not reimplement it.
- **Watch:** `cashFlow` deliberately does not level a credit at a recurring merchant
  (`analytics.ts:519–521`) because a refund has no span to spread over. `baselineSplit` must
  make the same exception when levelling is added to it.

### The two dispositions being extended to three

- **Location:** `src/components/finances/insights/OneOffReview.tsx`
- **Relevance:** the component's doc comment already states the problem this spec solves, in
  its own words. Read it before rewriting it — the design rationale it records is being
  extended, not discarded.

### The ownership pattern every new mutation copies

- **Location:** `setOneOff`, `src/lib/finances/mutations.ts:285–324`
- **Key pattern:** select the owned ids first, compare the count, throw a message that does
  not distinguish "not yours" from "does not exist", then scope the `update` by `userId`
  again rather than relying on the check above it.

### Merchant identity

- **Location:** `effectiveMerchant` (`analytics.ts:101`), `normalizeMerchant`
  (`src/lib/finances/classify/merchant.ts:108`), `matchRule`
  (`src/lib/finances/classify/rules.ts`)
- **Relevance:** the declaration key. `GEICO` resolves through the `geico` rule
  (`rules.ts:233`) to the display merchant `Geico`; `TAYLOR GAS HEATING AIR` has no rule and
  falls back to its normalized description — which is why Task 7 adds one, so the key is a
  name rather than a bank string.

### Panel and table conventions

- **Location:** `src/components/finances/insights/RecurringTable.tsx`, `Panel.tsx`
- **Key patterns:** annualize because "$34.71 a month is beneath noticing and $416 a year is
  a decision"; sort by the annual figure, not the charge; `PanelEmpty` for the empty state.
  `cadenceLabel` (`RecurringTable.tsx:8`) caps at "Quarterly" and moves to the lib module.

### The setting the levelling hangs off

- **Location:** `levelRecurring` in `src/lib/settings/finances.ts:72` and its checkbox at
  `InsightsView.tsx:330`; the explanatory subtitle at `InsightsView.tsx:414`
- **Relevance:** no new control is added. The subtitle is the precedent for how a levelled
  view says out loud that it is levelled; the baseline tile gets the same treatment.
