# Zero-based budgeting — Shaping Notes

**Status: frozen / complete** (2026-08-22)

## Scope

An envelope (zero-based) budget as a new page in the Finances module, built beside the existing
Available to Spend / Commitments system rather than replacing it.

**In:**

- User-editable category groups and categories (`finance_category_groups`,
  `finance_budget_categories`).
- Per-month allocations with Actual's exact balance/carryover/Ready-to-Assign semantics.
- `/finances/budget` — the month grid, the summary header, inline assignment, move-money,
  cover-overspending, rollover toggle, copy-last-month, N-month-average, hold-for-next-month.
- A budget category on the transaction, filled by auto-map and editable in the Register.
- On-budget / off-budget as an explicit account column.
- Two setup presets, Minimal recommended.

### Out of scope

- Goal templates (Actual's `#template`), and with them any return to autopilot.
- Schedules, rules, payees, budget-axis reports, the tracking budget type.
- Multi-month side-by-side columns.
- Income carryover meaning "hold this income for next month".
- Any change to Available to Spend, Commitments, the Dashboard, the classifier, or Insights.
- Deciding which of the two systems survives. That is a later call, made from use.

## Decisions

The full decision set is D1–D8 in `plan.md`. The ones that came from shaping rather than from
reading Actual:

- **The reversal of `2026-08-16-1938-commitments` D0 is narrow and has to be argued, not
  assumed.** D0 rejected discretionary envelopes as busywork. The user's own account is that the
  busywork came from YNAB's default suggested category list — two dozen envelopes to shuffle
  between — which was a configuration choice, not a property of the model. So D0's reasoning is
  kept for the category list (D5's Minimal preset is the direct descendant of it) and dropped for
  the model.
- **The real failure being fixed is expressive, not arithmetic.** Available to Spend is correct.
  It collapses "four annual bills are each $300 underfunded" and "you are $1,200 short this week"
  into the same number, and only one of those has a move attached to it.
- **Parallel, not replacement.** Confirmed with the user. Both systems run; the comparison is the
  point.
- **Start fresh at the current month.** Confirmed with the user, and it matches Actual's own
  advice for anyone digging out. It also makes D2's opening-position base case the only history
  the budget needs.
- **The invariant is a feature, not just a test.** `readyToAssign + Σ balances == on-budget
position` holds only when everything is categorized, so the shortfall is exactly the
  uncategorized backlog. Putting it on screen makes the budget self-auditing.

## Context

- **Visuals:** None. Actual's own Budget screen at `../actual` is the reference; the layout is
  the shared `DataGrid`, not a new one.
- **References:** `references.md` — Actual Budget (MIT) for the semantics, and the existing
  finance module for every pattern the implementation reuses.
- **Product alignment:** `agent-os/product/roadmap.md` § Financial planning has carried
  "**Next:** Envelopes" since 2026-08-12, closed by Commitments on 2026-08-16 under a name chosen
  to avoid promising YNAB. This reopens it deliberately, with the reason recorded. The roadmap's
  premise — "as simple for me as if I only had a single checking account… what I have is what I
  have" — is what D3 encodes as the on-budget account set.

## Standards Applied

- `development/clean-code` — app → components → lib → db direction; the math is pure lib, actions
  stay thin, every mutation takes `userId`.
- `development/testing` — pure logic gets a co-located unit test; anything touching the database
  gets an integration test with a second user attempting read/change/delete; no React component
  tests; `npm run smoke` after adding a route.
- `development/dates` — `YYYY-MM-DD` calendar keys, UTC-noon encoding, never `startOfDay` on a
  calendar field. Month keys are derived, not stored as timestamps.
- `development/commits` — one logical change per commit; the Spec trailer points here.
- `database/migrations` — drizzle-kit generates it, never hand-written.
- `components/data-grid` — the group → category tree, persisted view state, the row menu taking a
  nullable row.
- `components/ux-principles` — inline editing, decimal commit on blur, modals only for
  confirmation and capture.
- `components/navigation` — the page registered once in the module registry; every command has a
  menu entry; unavailable is disabled with a reason, never absent.
- `components/responsive` — list + sheet below `md`, 44px targets, long-press for the row menu.
- `development/security` — every mutation proves ownership before writing.
