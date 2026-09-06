# References for "A bill's expected charge follows its charges"

## Governing specs

### `agent-os/specs/2026-08-25-0901-bill-next-charge/`

- **Relationship:** Supersedes **D4**, both halves.
- **Relevant decisions:** D4 said the last posted charge is looked up "through the **payee
  claim** (same join as `lastChargeByEnvelope` — not the transaction's `budget_category_id`)"
  and that a Next charge on or before it is refused. D3 here reverses the basis and D2 widens
  the refusal. What carries forward is D4's _purpose_, which is the reason D2 exists at all: a
  stored date must never be one `billAnchor` ignores, or the save looks like it bounced. D1
  (inline `DateKeyCell`), D2 (the write is `anchorDate`), D3 (unscheduled stays unscheduled)
  and D5 (next-due for every scheduled bill) are untouched.

### `agent-os/specs/2026-09-06-1301-pile-spent-is-not-a-raid/`

- **Relationship:** Supersedes the **diagnosis** in D4 and in Changes-from-plan row 3. No
  decision of it changes.
- **Relevant decisions:** D4 correctly refused to let the anchor's state affect the ask — "D1
  leaves no phantom ask in **either** anchor state, so this is a Bills-page display question".
  That judgement holds and is why this spec can move the anchor without disturbing the budget:
  Dropbox stays Fully Spent, its ask moving $63.54 → $4.89 exactly as that spec's Changes row 1
  predicted for a rolled anchor. Its D1 (behaviour picks the basis), D2 (accepted consequences)
  and D3 (the bar mirrors the ask) are all downstream of `expectedKey` and inherit this change
  without edits.

### `agent-os/specs/2026-09-05-1401-bill-due-dates-and-lead-time/`

- **Relationship:** Extends **D1** and **D2**.
- **Relevant decisions:** D1's _"a posted charge is assigned to its **nearest** occurrence
  rather than becoming the next anchor"_ is the rule D1 here generalises to the undeclared
  branch — same rule, applied to a stored anchor instead of a declared series. D2 (_"undeclared
  bills keep today's behavior… a 28-day autoship genuinely is a walk"_) is the reason the
  undeclared branch keeps walking rather than growing a series of its own. D3's grace of 7 days
  and D7's single review check are unchanged; the new "Amount changed?" panel sits beside D7's
  panel and does not touch it.

### `agent-os/specs/2026-08-26-2022-split-transactions/`

- **Relationship:** Extends **D2** and **D3**.
- **Relevant decisions:** D2's two row sets — leaves (`is_parent = false`) for "how much
  money?", non-children for "how many transactions?" — are what D3 here must declare when it
  starts grouping by `budget_category_id`. D3's rule that a split parent holds no envelope is
  what makes the leaf filter a declaration rather than a correction. Its Changes row 1 is why
  the filter is `moneyRows` from `splitRows.ts` and not an inline `eq(isParent, false)`.

### `agent-os/specs/2026-08-29-1228-feed-ownership-watermark/`

- **Relationship:** Extends **D5**.
- **Relevant decisions:** D5 gave a bill envelope's claim an amount-and-cadence gate
  (`billClaimMatch.ts`), because CVS is both a $5 membership and a shopping trip. That gate is
  right for filing and wrong for dating — see `plan.md` D3 — and D5 here fixes the stale
  `expected_cents` that makes the gate misfire on seven bills, which is the same defect seen
  from the other end.

### `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/`

- **Relationship:** Extends.
- **Relevant decisions:** "Propose, never apply" — the founding rule of every declaration in
  this area, which the amount nudge follows exactly as `suggestLeadDays` does.

### `agent-os/specs/2026-08-21-1122-commitments-curation/`

- **Relationship:** Extends **D7**.
- **Relevant decisions:** D7 settled that "an `anchorDate` later than the last posted charge
  **is** the charge being waited for", quoted in `billAnchor`'s own doc comment. D1 here
  corrects it: later is not the same as still ahead, and the doc comment is rewritten with it.

## Similar implementations

### Nearest-occurrence matching

- **Location:** `src/lib/finances/billSchedule.ts` — `nearestOccurrence`,
  `nextOccurrenceAfter`, `firstOccurrenceFrom`.
- **Relevance:** the rule D1 generalises, and the tie-breaking argument to copy ("ties go to
  the earlier occurrence, which is the one already owed").
- **Key patterns:** measure from a seed, never step from the previous value; let the cadence
  define the bucket rather than tuning a tolerance constant.

### A flags-never-applies review panel

- **Location:** `src/lib/finances/commitments.ts` — `billsNeedingReview`;
  `src/components/finances/bills/BillsView.tsx:355-400` — the "Still active? · dates to review"
  disclosure.
- **Relevance:** the shape D5's panel copies — pure rule in lib, panel renders it, buttons
  patch through the existing `ctx.patch`.
- **Key patterns:** the panel states what it does _not_ prove ("This asks for review; it does
  not prove a payment was missed"); the grace lives in the lib rule, not in the component,
  because it once lived in the component and flagged 42 spurious days.

### A suggested-not-applied figure

- **Location:** `src/lib/finances/billSchedule.ts` — `suggestLeadDays`.
- **Relevance:** the exact register for D5 — a median over recent history, offered for
  confirmation, with a documented reason for the median over the mean and for the minimum
  history it needs.

### Amount as identity

- **Location:** `src/lib/finances/amountMatch.ts` (`approxThreshold`, Actual's 7.5% band) and
  `src/lib/finances/commitmentRows.ts` (`observedAmountRange`, the 25% spread band).
- **Relevance:** D5 needs both — one to decide the declared amount is wrong, the other to
  decide the recent charges agree enough to propose a replacement.
- **Key patterns:** `observedAmountRange`'s own comment on why a ratio beats a standard
  deviation at n=2 is the argument D5 reuses.

## Reference implementation outside this repo

### Actual Budget

- **Location:** `../actual` — `packages/loot-core/src/shared/rules.ts`
  (`getApproxNumberThreshold`), `server/aql/schema/executors.ts` (the leaf-row default).
- **Relevance:** both bands this spec relies on are Actual's, already ported; see
  `docs/actual-budget/README.md`. Nothing here diverges from them.
