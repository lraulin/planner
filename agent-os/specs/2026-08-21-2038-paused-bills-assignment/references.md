# References for Paused bills and assignment visualization

## Governing specs

### `agent-os/specs/2026-08-14-1104-unscheduled-bills/`

- **Relationship:** Extends. `scheduled` is still “dates knowable”; yearly cost is stated; nothing infers unscheduled. Amount regularity is measured, never declared.
- **Gap this spec closes:** the later Dashboard Bills panel prints `due {nextDueKey}` for every accrual, including unscheduled propane.

### `agent-os/specs/2026-08-16-1338-finances-dashboard-available/`

- **Relationship:** Extends the formula. Supersedes only the Bills panel due-date caption.
- **Carries forward:** checking − pending − cards − set-asides − recurring spend; savings excluded; negative renders; pending only on synced headlines.

### `agent-os/specs/2026-08-16-1938-commitments/`

- **Relationship:** Extends. D0 (no tier 3) and the cadence admission test stand.
- **Changed here:** D9’s `active | cancelled | ignored` gains `paused`.

### `agent-os/specs/2026-08-18-2058-commitments-clarity/`

- **Relationship:** Supersedes only “`status === "active"` is the entire hold gate” as an _unqualified_ sentence. The gate is still status; paused is the new non-hold that is _not_ dismissed.
- **Carries forward:** Hold checkbox stays deleted; Set aside column shows the accrual; Dismissed leaves the bills grid.

### `agent-os/specs/2026-08-21-1810-register-track-as-bill/`

- **Relationship:** Extends. Track-as-bill remains the declare path for a one-charge or irregular bill. Default stays `scheduled: true`; this spec adds the Unscheduled control the Taylor Gas case needed.

## Similar implementations

### Accrual and hold gate

- **Location:** `src/lib/finances/available.ts` (`setAsideHeld`), `src/lib/finances/commitmentRows.ts` (`billRows`, `activeBillTotals`)
- **Relevance:** Pause is a new status on the existing gate, not new arithmetic.
- **Key patterns:** `status !== "active"` → `held: null`; totals filter `status === "active"`.

### Status write

- **Location:** `src/lib/finances/mutations.ts` (`setSubscriptionStatus`, `upsertRecurringBill`), `src/lib/agent/contracts.ts` (`z.enum` on status)
- **Relevance:** Agent enum is a strict-schema break by design.
- **Key patterns:** `setSubscriptionStatus` loads scoped by `userId`, throws `Bill not found.` for a second user.

### Amount range

- **Location:** `src/lib/finances/analytics.ts` (`RECURRING_VARIANCE_RATIO = 0.25`, `lowCents`/`highCents`)
- **Relevance:** Same 25% band; whole-dollar print from the unscheduled spec’s as-built change 4.

### Dashboard terms

- **Location:** `src/components/finances/dashboard/DashboardView.tsx` — headline + `available.terms` `dl`
- **Relevance:** The bar is a drawing of those terms, not a second calculation. `availableToSpend` already returns terms so the page cannot disagree with itself.

### Insights stacked bars (what not to copy)

- **Location:** `src/components/finances/insights/CategoryBars.tsx`
- **Relevance:** Deliberately not stacked, because ranking is the question there. Assignment is composition, so stacked-against-checking is the right encoding _here_.
