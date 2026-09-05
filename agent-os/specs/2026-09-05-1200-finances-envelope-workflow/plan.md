# Finances centered on envelope budgeting

**Status: frozen / complete** (2026-09-05)

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-2206-single-pool-budget/` — one pool and reconciliation.
- **Extends:** `agent-os/specs/2026-08-28-1000-ynab-target-engine/` — existing assignment requirements.
- **Extends:** `agent-os/specs/2026-08-23-1807-nested-budget-groups-bill-import/` — hierarchy.
- **Extends:** `agent-os/specs/2026-08-28-1356-budget-activity-register-links/` — contributing rows.
- **Supersedes:** `agent-os/specs/2026-08-23-2313-one-budget/` — Dashboard role, forecasts on Budget, paycheck-only expected income. Bill identity and recurrence remain.
- **Supersedes:** `agent-os/specs/2026-08-13-2121-insights-interactive-reports/` — baseline/one-off reporting and name-based report identity.
- **Supersedes:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` — Dashboard as finance home.

## Agreed outcome

Budget assigns money; Accounts refreshes feeds, opens banks, imports and reconciles snapshots; Bills manages bill details and forecasts; Register categorizes transactions; Insights reports spending, balances, and cash flow. Budget is the default finance page, remembered pages and existing tab order survive. Dashboard bookmarks redirect to Accounts.

### Accounts

Top actions: Refresh accounts, Paste bank snapshot, Import transactions. Open accounts by default with All accounts retained. Main grid shows bank links, working balance, posted/pending breakdown, balance as-of, source, freshness and account-specific errors. Compact pool totals. Preserve source precedence, snapshot reconciliation and Activity receipts; refreshed server data must update client rows.

### Budget and Bills

Keep Budget section order, four money columns, funding bars, inspector and assignment behavior. Bill names show next charge, Before payday / On payday independently of funding, only for the current month. Retain payday detection and override. Due soon links to Bills (14 days). Move forecasts and recurring review into Bills.

Bills uses existing envelope IDs and mutations. Flat Active bills sorted next charge/name by default; Due soon and All bills presets, filters, grouping, saved views and multi-sort. Bill, Group, Next charge, Amount, Cadence, Status default columns; monthly/yearly cost, last charge, payees, website, notes optional. Inline fields and full-record drawer share Budget bill controls/validation. Open in Budget and View transactions; assigning remains in Budget. Recurring discovery and Still active review live here. Passed expected dates ask for review, never assert missed payment. Unscheduled/cancelled bills get no invented next date.

Forecasts are initially collapsed with remembered disclosure. Next 12 months and Bill commitments vs regular income; remainder is After bills, before other expenses.

ID-based Budget links and Register return links restore month, envelope selection and group visibility without rewriting saved filters. Accounts is directly reachable from Budget.

### Income planning

Income-only metadata: incomeRole (regular/other), expectedMonthlyIncomeCents (nullable nonnegative integer). New income defaults Other. Configure Lee’s verified Payroll/VA IDs Regular and Gifts/Interest Other in a recorded setup step; estimates stay unset. Regular/Other income bands show receipts and editable Regular expectations. All receipts still feed Ready to Assign.

Beside combined Regular Spending + Bills: Expected regular income, Planned funding this month, Plan margin. Planned funding sums max(existing monthly assignment requirement, positive assigned) per envelope. Inactive bills count existing assignments only; Savings excluded. Missing estimates, targets or bill amounts visibly mark an incomplete comparison.

### Insights

Persist report, period, filters and expansion. Stable envelope/group/payee/account IDs; current organization presents all history. Migrate old name filters only if unambiguous.

Spending defaults Cost of living (actual Regular Spending + Bills against actual Regular income); scopes Savings / All spending. Nested groups and envelopes, ungrouped rows, ranked totals, monthly trends, secondary payees. Savings purchases do not inflate living expenses. Current partial month separate from completed-month averages. Uncategorized remains visible with categorization link.

Envelope balances shows selected month Carry-in / Assigned / Activity / Available from existing Budget fold, including hidden/cancelled money. Never sum Available over time or reconstruct assignments before setup. Account/payee filters apply only to transaction reports. Envelope selection narrows spending; its regular-income comparator retains the same account/payee scope. Account-position history remains whole-account history and is labelled separately from transaction filters.

Cash flow preserves inflows/outflows/net, position history, optional Sankey, transfer exclusions and statement-reconciliation distinction. Gifts and Savings purchases count. No source-to-purchase attribution. Carrying costs/coverage are secondary; upcoming/recurring bills leave Insights.

Shared contribution rules: split leaves once, selected pending sources, on-budget membership, no transfers inside pool. Drill-downs identify exactly their contributing rows and preserve report context.

Retire baseline calculations, one-off suggestions and exclusion writers. Archive exclusion metadata and preserve event labels in notes before generated destructive migration. No automatic assignment changes. Register Tools retains Rebuild transaction classifications, manual overrides and audit.

## Tasks and acceptance

- [x] Save active spec and pinned standards. User explicitly requests implementation in this fresh session.
- [x] Income metadata, constraints, verified setup and cross-user tests.
- [x] Accounts operational grid and navigation.
- [x] Bills management, shared fields, forecasts and Budget due cues/context.
- [x] Shared reporting foundation, three reports and exact Register drills.
- [x] Metadata archive/retirement, stable finance tools and generated docs.
- [x] Tests: gift/house, accumulated Savings, nested/duplicate groups, refunds, splits, hidden, uncategorized, pending/transfers, bill date boundaries, same-record editing, ownership.
- [x] Lint, typecheck, unit/integration suites, build, smoke; desktop/phone both themes; daily workflow and sorting while editing.
- [x] Production deployment verification; update roadmap and freeze after release.

## Changes from original plan

| Change                                                                                            | Why                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec recorded at implementation start                                                             | Previous agent supplied a plan but no saved folder; user explicitly authorized carrying it through in this fresh context.                         |
| Existing bill edits resolve by envelope ID; legacy name-only callers reject ambiguous matches     | Nested groups already allow duplicate names. Name matching could silently edit another bill or mix forecast charge histories.                     |
| Regular-income comparisons retain account/payee scope when expenses are narrowed                  | Selecting an expense envelope must not turn the income comparator into a misleading zero.                                                         |
| Report and Budget activity entry points use separate Register working scopes                      | Exact drill-down entry must not erase the ordinary Register’s saved filters.                                                                      |
| Nullable amount fields show blanks and accept explicit zero                                       | An unset estimate is unknown, not a zero-dollar plan.                                                                                             |
| Phone balances open a detail sheet; balance totals link to Budget and activity totals to Register | Carry-in, assignments and Available are balance facts, not transaction sums.                                                                      |
| Shared grid double-clicks inside controls stay in the editor                                      | The phone/desktop workflow check reproduced drawer focus theft while editing an amount. The shared row handler now excludes interactive controls. |

## Follow-ups (new work — not amendments to this frozen spec)

No implementation work remains in this scope. Income expectations deliberately start unset for the user to enter. Future behavior changes open a new delta-spec referencing this folder.
