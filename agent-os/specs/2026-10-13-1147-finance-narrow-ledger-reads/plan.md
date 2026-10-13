# Finance pages read what they use, not the ledger

**Status: active**
Spec folder: `agent-os/specs/2026-10-13-1147-finance-narrow-ledger-reads/`

> Shaped 2026-10-13. Task 1 (this folder), Task 2 (ledger refreshed, baseline captured),
> Task 3 (Accounts reads no ledger; `loadDashboard` retired), Task 4 (the forecast reads
> bill-envelope rows), Task 5 (Review loads when its drawer opens), Task 6 (Insights
> tidy-up, split totals by one aggregate join) and Task 7 (the Register names the reader's
> day) are done; implementation continues at Task 8. Progress is in **Changes from original plan** and **Verification**.

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-24-1945-register-prepared-rows/` — compact index plus
  100-row blocks, virtualization, and the unit-tested JS pipeline as the authority on filter,
  search, sort, group and collapse.
- **Supersedes:** `2026-08-24-1945-register-prepared-rows` — "The server loads the user's
  ledger" for _every_ index (now only for unbounded queries and the derived views), and the
  index "returns … facets" (now on demand, D10). Change #1 stands as a requirement
  (assignability is a whole-ledger fact); its mechanism changes (D9).
- **Supersedes:** `agent-os/specs/2026-09-03-1307-register-date-presets/` D6 — "No SQL date
  window." Its own `shape.md` named a DB window as "a later delta"; this is it. D1–D5, D7, D8
  carry forward: the band still _matches_ in `prepareRegister`.
- **Supersedes:** `agent-os/specs/2026-08-16-1338-finances-dashboard-available/` change #6 —
  "`loadDashboard` is one composed read." The page it served no longer reads most of it.
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` change #7 — the
  Insights page still loads the whole history. Reaffirmed, not changed (D5).
- **Extends:** `agent-os/specs/2026-09-06-1427-bill-anchor-retires/` D4 and
  `agent-os/specs/2026-08-23-2313-one-budget/` D8 — a bill's charges are what is filed to its
  envelope; the forecast panels stay.
- **Extends:** `agent-os/specs/2026-08-14-1012-recurring-bill-cadences/` change #4 — a
  declared bill's amount reads the whole history.
- **Extends:** `agent-os/specs/2026-09-05-1642-bills-open-record/` — "Discover recurring
  charges" stays a page command; only its count goes (D4).
- **Sibling, independent:** `agent-os/specs/2026-10-12-2001-node-postgres-driver/` (active).
  That one removes round trips; this one removes rows.
- **Sibling, independent:** `agent-os/specs/2026-10-13-1155-immediate-navigation-and-page-cache/`
  (active, shaped the same hour). It makes a click respond at once and caches Budget, Accounts
  and Bills in the browser; it puts server render time out of its own scope. Both edit the
  finance `page.tsx` files (it moves `AppShell` into a layout), so whichever lands second
  rebases. Its cache makes a _revisit_ cheap; the first visit, and every Register load (which
  it never caches), still cost what this spec measures.

## Context

Measured 2026-10-12, signed-in browser on production, server RSC response: Accounts 305 ms,
Budget 337 ms, Bills 510 ms, Register 384–956 ms (870–1,580 ms to settle). A production round
trip is about 4.5 ms and accounts for 30–45 ms of each. The rest is fetching and reducing
rows: `listTransactions` (~70 ms locally) and `loadInsightsRows` (~40 ms), each over all
7,100 rows, 2–3× slower in production.

Precedent, same day (`437ad77d`): Budget loaded every row to derive paydays. `loadPaydays`
now reads the income rows alone (66 ms → 12 ms) and shares its row scope with the full read
through `countedRows`.

### What shaping found (local ledger, 2026-10-13, read-only)

| Fact                                                                    | Evidence                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Accounts uses none of the ledger-derived fields                         | `AccountsView` reads only `operations.pending` and `operations.connections`                     |
| The forecast no longer uses paydays                                     | `loadBillForecast` never calls `paydaysFrom`; its doc comment is stale                          |
| Review needs nearly every row                                           | 5,906 spend charges of 7,099 money rows; narrowing rows alone is 14 ms → 9 ms                   |
| Two-thirds of `listTransactions`' database time is the split subqueries | psql: 45 ms as written, 15 ms without them; the ledger has one split parent                     |
| A date window alone does not remove the full read                       | `facets`, `total`, `notBudgetedIds` and the collapsed-year list are defined over the whole view |
| A SQL date bound from the Date column filter is a safe superset         | `passingRows` ANDs column filters, the cross filter and search                                  |
| This month is 9 rows locally; trailing 12 months is 1,276               | counts by `transaction_date`                                                                    |
| The local ledger cannot prove the forecast                              | it ends 2026-09-05: 5 bills, **one** row filed to a bill envelope                               |
| The Register's second request may be a full reload caused by a date key | page uses the server process's `localDateKey` (UTC on Vercel); client uses the browser's day    |

The last row is a hypothesis, not a finding. Task 7 confirms or replaces it before anything
is designed around it.

## Decisions

**D1 — A narrow read is a superset bound, and the pure function still decides.** SQL may
drop only rows the existing pure function provably never keeps, argued from that function's
own code (as `loadPaydays` argued from `effectiveFlow`'s fallback). The function still runs
over what was read. No JS rule is restated in SQL as the authority. Row scope comes from one
place: `countedRows` for money reads, `bankRows` plus the user for register reads. A read
disappears entirely only when nothing consumes its result.

**D2 — Accounts reads no ledger rows.** The page calls `loadAccountsWithPending` and
`listConnections` beside its existing `listLinks` and `loadBudgetMismatch`. `AccountsView`
takes `{ pending, connections }` instead of `DashboardData`. `loadDashboard` and
`DashboardData` are retired. The five agent tools that called it take the narrow read each
needs: `loadRecurringBills` (three of them need only `bills`), `loadBillCharges` (D3),
`loadMerchantNames`, `loadReviewCandidates`.

- _Read:_ accounts (three queries, already shared), pending candidates, connections.
- _Minimum because:_ those are the only fields the view reads.
- _Equality:_ dump `{ accounts, pending, connections }` before and after.

`loadMerchantNames` reads distinct `(description, payee name)` over `countedRows` and applies
`effectiveMerchant` in JS: distinct inputs give the same set as distinct outputs.

**D3 — The bill forecast reads only rows filed to a bill envelope.** `loadBillCharges(userId)`:
`countedRows`, inner join to this user's `kind = 'bill'` categories, the five columns the loop
reads (`budgetCategoryId`, `transactionDate`, `amount`, `derivedFlow`, `flowOverride`), ordered
by date then id as the full read is. `spendCentsOf(row) > 0` stays in JS.

- _Minimum because:_ the loop skips every row whose envelope is not in `bills`, and `bills`
  is exactly this user's `kind = 'bill'` categories.
- _Equality:_ dump `loadBillForecast` (Maps as ordered entry arrays) before and after on the
  refreshed ledger; integration test compares against the derivation from `loadInsightsRows`.

**D4 — Review candidates load when the drawer opens.** The Bills page stops calling
`loadReviewCandidates`. The button and command read "Discover recurring charges" with no
count. Opening the drawer calls a server action; after a save the drawer refetches. The read
behind it narrows to spend charges: `amount < 0` and
`coalesce(flow_override, derived_flow, 'spend')` in `spend | interest_fee | refund`, with the
eight columns detection reads.

- _Minimum because:_ `recurringMerchants` and `spendCandidates` see rows only through
  `chargesByMerchant` / `chargesByPayee`, both of which keep `spendCentsOf(row) > 0`. That is
  positive exactly when the flow is a spending flow and the amount is negative (a positive
  `interest_fee` returns 0; a null flow with a negative amount falls back to `spend`).
- _Equality:_ dump the action's result against today's `loadReviewCandidates` output.

**D5 — Insights keeps the whole history, on purpose.** It is the one page whose job is to
re-slice every row in the browser. Unchanged row set. Two tidy-ups: drop the `notes` column
`readInsightsRows` selects and never returns, and correct the module comment ("three thousand
rows is a few hundred kilobytes" is now 7,100 rows and ~5 MB). The comment names the trigger
for a windowing spec and what that spec must solve first: the balance and asset/debt series
need opening balances, and declared-bill amounts need the whole history.

**D6 — Split-child totals come from one aggregate join.** `TRANSACTION_LIST_COLUMNS` reads
`splitChildCount` and `splitChildTotal` from a join to
`select parent_id, count(*), sum(amount) … group by parent_id` scoped to the user, not two
correlated subqueries per row. One definition, shared by `listTransactions`,
`listTransactionsByIds` and `getTransaction`. Same columns, same values.

**D7 — The Register's second request is identified before it is fixed.** Task 7 logs the
server's query key and the client's first key and records the difference in **Changes from
original plan**. Requirement whatever the cause: with default grid state, no index request
fires on load, at any hour. If the cause is the date key, the page computes today in the
reader's zone (`zonedDateKey`; see `development/dates.md`) so both sides agree.

_Found (Task 7, 2026-10-13):_ two causes, one mechanism — the page builds its first query
from defaults and the browser builds its own from what it is showing, and any difference
throws the server's work away. (1) **Date key**, as hypothesised: `today` was the server
process's zone (UTC on Vercel), the browser's was the reader's, so for four evening hours a
day the keys differed in `today`. Reproduced by running the server in a zone whose date
differs (`TZ=Pacific/Kiritimati`): first client key `today: 2026-10-14`, then the browser's
`2026-10-13`, one `loadRegisterIndexAction`. Fixed here: the page names the reader's day
(`readerTodayKey`). (2) **A stored layout.** The restored production settings hold
`grid:finances = { view: "saved-…" }`, a saved view with no grouping and two columns hidden,
so the browser's first key differs in `groupBy`, `collapsedGroups` and `visibleColumnIds`
from the page's defaults and a request fires on every load, at any hour. Not fixed here;
see Changes #7.

**D8 — The Register reads the Date filter's window when it is bounded.**
`registerDateBound(query)` is a pure function beside `prepareRegister`. It returns
`{ from, to }` only when `viewId === "all"`, `today` is known, and `filters.date` is a
calendar band or a custom comparison with a finite bound. Anything else returns null and the
read is the whole ledger, as today. `prepareRegister` is unchanged and still applies the date
filter to what was read.

- _Minimum because:_ the Date column filter is ANDed with everything else, so no row outside
  its bound can reach `matched`.
- _Not narrowed, on purpose:_ Uncategorized, Activity and Report views (their base set is
  derived from the whole ledger by eligibility and contribution rules), Date = All, and any
  query whose only date condition sits in the advanced (cross-column) filter.

**D9 — Whole-view facts stop riding on the windowed rows.** In the `all` view:

- `total` is the count of bank rows.
- `notBudgetedIds`, and `categoryAssignable` on every block row, come from the
  **assignability subset**: off-budget account rows, rows with a `transfer_group_id`, and rows
  whose stored flow is `internal_transfer`, read narrow and in ledger order, through the same
  `categoryAssignableIds`. A row outside all three is always assignable, and transfer partners
  share a group id so both are in the subset.
- **Never annotate the window.** A transfer whose other leg falls outside it would be judged
  without its partner — the bug prepared-rows change #1 fixed.
- The page's collapsed-year default comes from distinct years, folded into the same query as
  the count so the wave stays within `read-latency.md`'s ten.

**D10 — Facets load on demand.** `RegisterIndex.facets` is removed. A facets action runs
`collectDistinctValues` over the view's base rows (a full read, the same function) the first
time a column menu or filter dialog opens, and the client keeps the answer per view until
`reload()`. No facets request fires on load.

**D11 — Left alone, and why.** Export (complete by definition). Track-as-bill draft and
Scenarios (full reads behind a dialog and a secondary page; follow-ups). Agent analysis and
search tools (whole-history questions). Budget (done 2026-10-12).

**D12 — No budget number changes.** Nothing in `envelope.ts`, `base.ts` or
`budgetContributionSql` is touched or restated. `contributesToBudget` stays on
`loadInsightsRows`.

**D13 — How equality is proven.** For every loader changed:

1. On the refreshed local ledger (Task 2), dump the loader's output to JSON at the base commit
   and again after the change; `cmp` must report no difference. Maps and Sets are written as
   arrays in iteration order, because order is part of the output. Byte size and sha256 go in
   the commit body and the verification table.
2. An integration test seeds the edge cases the argument in D1 depends on and compares the
   narrow read with the derivation from the full read: a refund and a positive `interest_fee`
   on a bill envelope, a null-flow row, a flow decided only by override, a split child filed
   to a bill, a superseded pending hold, a transfer whose partner is outside the window, an
   off-budget account.
3. In the same test a second user gets nothing from every new or changed read and action,
   and passing the first user's ids changes that at no step.

## Acceptance criteria

- [x] Local ledger refreshed from a production backup; row counts recorded here (Verification,
      "Baseline").
- [ ] `/finances/accounts` issues no query selecting transaction rows beyond `listAccounts`
      and the pending candidates; `loadDashboard` no longer exists.
- [ ] `/finances/bills` reads only rows filed to bill envelopes; the review list loads on
      drawer open and again after a save.
- [ ] Insights output is byte-identical; `notes` is no longer selected.
- [ ] With default grid state, `/finances/register` reads the month's rows, the assignability
      subset and one count/years query — not the ledger — and fires no index or facets request
      on load, checked at an hour when the UTC date differs from the local one.
- [ ] Changing sort, search or a non-date filter while Date is bounded reads the window only.
- [ ] Date = All, Uncategorized, Activity and Report still return exactly what they do today.
- [ ] Every dump in D13 is byte-identical; the facets action equals the old `index.facets`.
- [ ] `registerDateBound` is unit-tested per band, custom bounds, unknown today, non-`all`
      views and an advanced-filter-only date condition (all three of the last return null).
- [ ] Second-user integration tests pass with no skip warning.
- [ ] `npm run perf:routes -- finances`: no route's longest chain grows.
- [ ] Lint, typecheck, `npm test`, build, `npm run smoke` with the dev server up.
- [ ] Production RSC timings for Accounts, Bills and Register re-measured after deploy and
      recorded beside the 2026-10-12 figures.

## Verification

### Baseline (Task 2, base commit `6d5e23c4`, 2026-10-13)

**The ledger.** Production archive `planner-production_2026-10-12T18-44-29Z.dump.gpg`
(3,330,499 encrypted bytes, sha256 `4660cec8…c105ee`, verified against its sidecar) restored
into a separate local database, one user. The archive is PostgreSQL 18.6; the local server is
17.10 and took it with `--exit-on-error`. 104 of 104 migrations were already applied.

| Count                                           | Rows  |
| ----------------------------------------------- | ----- |
| `finance_transactions` (money rows = bank rows) | 7,459 |
| split children / split parents                  | 0 / 0 |
| rows filed to a `kind = 'bill'` envelope        | 905   |
| bill envelopes                                  | 35    |
| spend charges (D4's predicate)                  | 6,232 |
| transfer legs (`transfer_group_id` set)         | 702   |
| pending                                         | 0     |
| this month (2026-10-01 to 10-11)                | 34    |
| trailing twelve months                          | 1,323 |
| calendar years / users                          | 7 / 1 |

This ledger ends 2026-10-11, not 2026-09-05, and it is the first one on which D3 compares
something: 905 rows reach a bill envelope, against **one** in the shaping ledger. It holds no
split parent, so D6's equality is trivially true here and the split cases are the
integration test's job.

**Loader times, local, median of 11 after two warm-ups** (`timing.mts`, taken under the
shared timing lock, load average 23 on 12 CPUs, so read the ratios, not the milliseconds):

| Loader                                       | Median ms |
| -------------------------------------------- | --------- |
| `loadDashboard` (Accounts page, today)       | 70.3      |
| Accounts page, the narrow reads (D2)         | 4.5       |
| `loadBillForecast`                           | 55.8      |
| `loadReviewCandidates`                       | 64.8      |
| `loadInsightsRows`                           | 53.3      |
| `listTransactions` (whole bank ledger)       | 52.3      |
| Register, This Month, `loadRegisterPrepared` | 67.3      |
| Register, Date = All, `loadRegisterPrepared` | 70.2      |
| `loadPaydays` / `loadBudget` (untouched)     | 6.8 / 8.8 |

The Accounts "after" row was timed at the base commit by composing the reads D2 names
(`loadAccountsWithPending` plus `listConnections`); it is what the page will do.

**`perf:routes -- finances`** at the base commit (10 ms one way; longest chain / queries /
unslowed ms): accounts 7 / 17 / 130, activity 5 / 3 / 185, bills 5 / 27 / 168, budget 9 /
24 / 91, insights 6 / 21 / 401, orders 4 / 10 / 125, payees 5 / 8 / 114, register 5 / 15 /
128, scenarios 9 / 17 / 111, statements 6 / 5 / 101, supplies 6 / 6 / 49.

**Dumps** (`dump.mts`, a throwaway driver kept outside the repo because its output is a
private ledger; "now" pinned to 2026-10-13T16:00Z, `today` 2026-10-13). Name, bytes, sha256
prefix. Byte-identical across two runs at the base commit.

```text
accounts-page                    3,871  746b72dee709
bills                           13,893  36c64d619a2a
bill-charges (by envelope name) 54,168  b04d59bffdfe
merchants                       16,822  50fe065549d0
review-candidates               54,528  da547f9e4c63
paydays                         10,292  a47d271f4ae1
bill-forecast                   89,809  e911bcb9ae3a
insights-rows                4,735,382  23c7248d52b2
carrying-cost                    1,247  ade94f5fd3a5
register-list (bank rows)    5,219,150  c4289bd4def0
register-by-ids (first 100)    69,315  753949e7d794
register-window (Oct 2026)      23,550  3c98e4de22d5
register-facets (every query)  200,732  c7db31594f1f   (activity 941, report 23,653,
                                                       uncategorized 157)
register-this-month             64,607  f8d79b96183c
register-last-month             97,453  8ec8f76c3c3e
register-last-30-days           98,290  962eaec5453e
register-this-year             209,056  cf14d41d8d68
register-custom-range          131,086  8b20ee99b378
register-this-month-search      37,639  81a2b4ae53ec
register-this-month-amount-asc  64,609  200e35d622aa
register-date-all              856,797  d26db9636756
register-uncategorized          36,500  6ac991dda483
register-activity               46,670  1a7f35f96067
register-report                190,580  2c4a62b63959
```

(The full list also carries last-7-days, this-year-search, this-year-uncategorized-flow,
uncategorized-this-month, unknown-today and collapsed-years; their hashes are in the commit
body of the task that first compares them.)

Per-task results, one row per loader (filled as each task lands, D13). "Rows" is ledger rows
the read pulls from the database; the hash is the dump's sha256 prefix, equal before and
after in every row. Local ms is filled once, in Task 10, from a back-to-back run of the base
commit and the final tree under the timing lock.

| Task | Loader                                                              | Rows before → after          | Dump bytes | sha256 before = after | Local ms before → after |
| ---- | ------------------------------------------------------------------- | ---------------------------- | ---------- | --------------------- | ----------------------- |
| 3    | Accounts page: `loadDashboard` → accounts + pending + connections   | 7,459 → 0                    | 3,871      | `746b72dee709` yes    |                         |
| 3    | bills for the agent tools (`loadRecurringBills`)                    | 7,459 → 0                    | 13,893     | `36c64d619a2a` yes    |                         |
| 3    | bill charges by name for `list_commitments` (`loadBillCharges`)     | 7,459 → 905                  | 54,168     | `b04d59bffdfe` yes    |                         |
| 3    | merchant names for candidate search (`loadMerchantNames`)           | 7,459 → 3,241 distinct pairs | 16,822     | `50fe065549d0` yes    |                         |
| 4    | `loadBillForecast` (Bills page), Maps as ordered entries            | 7,459 → 905                  | 89,809     | `e911bcb9ae3a` yes    |                         |
| 5    | `loadReviewCandidates`: Bills page load / drawer open / agent tool  | 7,459 → 0 / 6,232 / 6,232    | 54,528     | `da547f9e4c63` yes    |                         |
| 6    | `readInsightsRows` (Insights; `notes` no longer selected)           | 7,459 → 7,459                | 4,735,382  | `23c7248d52b2` yes    |                         |
| 6    | `listTransactions` (Register list, every `TransactionListRow` read) | 7,459 → 7,459                | 5,219,150  | `c4289bd4def0` yes    |                         |
| 6    | `listTransactionsByIds` (first 100 rows)                            | 100 → 100                    | 69,315     | `753949e7d794` yes    |                         |

Production RSC response, signed-in browser:

| Page     | 2026-10-12 | After |
| -------- | ---------- | ----- |
| Accounts | 305 ms     |       |
| Bills    | 510 ms     |       |
| Register | 384–956 ms |       |

## Changes from original plan

| #   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Task 2 restored the backup into a **separate database** (`planner_narrow_reads` in the same container), not over the dev `planner` database. The archive was decrypted by streaming `gpg` into `pg_restore` with the project's own `decryptToCommand`; no plaintext dump touched disk.                                                                                                                                                                                                                                                                                                 | Two other implementers were using the dev database at the same time, and a restore over it would have wiped their tests' fixtures. D13's equality proof only needs a ledger of the right shape, not the dev database.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2   | The refreshed ledger is not the shaping ledger: 7,459 rows ending 2026-10-11, **905 rows filed to 35 bill envelopes** (shaping saw one), and **no split parent**.                                                                                                                                                                                                                                                                                                                                                                                                                      | The forecast comparison (D3) now compares something. Split-child totals (D6) and any split-child-on-a-bill case cannot be proven from this ledger, so the integration tests seed them, as D13.2 already required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3   | `loadBillCharges` (D3) lands in Task 3, not Task 4, in a new pure module `billCharges.ts` (`billChargesOf` is the one loop from envelope rows to charges). Task 4 only moves the forecast onto it.                                                                                                                                                                                                                                                                                                                                                                                     | Retiring `loadDashboard` in Task 3 left `list_commitments` without its bill charges; the agent tool needed the narrow read in the same commit, and the forecast and the tool must not carry two copies of the loop.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4   | The five agent tools' reads, as built: `list_commitments` → bills + `loadBillCharges` + payees; `list_commitment_candidates` → bills + `loadMerchantNames` + analysis; `search_commitments` and `set_commitment_payees` → bills only; `find_commitment_candidates` → `loadReviewCandidates`. Their inputs and outputs are unchanged.                                                                                                                                                                                                                                                   | D2 listed these; recorded so the review does not have to rediscover which tool took which read.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 5   | Task 5's drawer shows "Looking for recurring charges…" while the list loads and keeps the list on screen while it refetches after a save. `reviewCandidates` is exported so the integration test can run the detectors over the full read as the oracle. `recurringMerchants`, `spendCandidates` and their helpers now take a `RecurringChargeRow` (eight fields) instead of an `AnalyticsRow`.                                                                                                                                                                                        | The narrow read returns eight columns; typing the detectors by what they read is what makes that checkable, where a cast would not be.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 6   | D6 went further than the column constant: `transactionListQuery(userId)` is now the one definition of the register row's columns **and** its four joins, and `listTransactions`, `listTransactionsByIds`, `getTransaction` and `listSplitChildren` each add only a `where` and an `orderBy`. The split-child aggregate is scoped by user on its own side of the join.                                                                                                                                                                                                                  | Four copies of the same three joins had already drifted in their comments; the aggregate join had to be added to each, and one definition is the cheaper way to keep the four reading one answer. Same columns, same values, byte-identical dumps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7   | D7's cause was two things, and only the first is fixed. The date key is fixed (`readerTodayKey`, one constant for the reader's zone, shared with the agent tools). The second, which is what Lee's own Register load hits, is a **saved view**: the page's first query is built from defaults and the browser's from the stored layout, so a request fires on every load for anyone whose layout is not the default. With the default layout (`?view=all`) and the server in a zone whose date differs, a load is one GET and no POST; with the saved view it is one GET and one POST. | Making the server derive the browser's query means resolving `useModuleViews` → `useSavedViews` → `useGridState` (stored working blob over the saved view over the built-in defaults, with `?view=` and the reseed-on-enter effect) a second time on the server, which `shape.md` rules out for the same reason it rules out filtering in SQL: two answers to one question. The cheap alternatives are a cookie that carries the browser's last query for the page to replay (the browser stays the only resolver; a stale cookie only costs the request it costs today) or moving the first query's preparation to the client. Both are a spec of their own. After Task 8 the request is a window read, not a ledger read. |

## Task 1: Save spec documentation

This folder: `plan.md`, `shape.md` (scope, the four decisions made in shaping, rejected
alternatives), `standards.md` (references pinned at `5f665924`), `references.md` (governing
specs and the narrow-read exemplars). No visuals. Done 2026-10-13.

## Task 2: Refresh the ledger and capture "before"

Restoring a production backup over the local dev database overwrites it: Lee runs it or
approves it in that session. Then, at the base commit and before any change: record row
counts (total, filed to bills, spend charges, this month), dump every loader named in D13
plus `prepareRegister` for a fixed query set (This Month, Last Month, Last 30 Days, This
Year, a custom range, This Month + search, This Month sorted by amount, Date = All,
Uncategorized), time each loader, and run `perf:routes -- finances`.

## Task 3: Accounts, and retire `loadDashboard` (D2)

`src/app/finances/accounts/page.tsx`, `AccountsView.tsx`, `dashboardQueries.ts`,
`src/lib/agent/financeTools.ts`, `dashboardQueries.integration.test.ts`.

## Task 4: Bills forecast (D3)

`loadBillCharges` in `dashboardQueries.ts`; `loadBillForecast` and the agent tool use it.

## Task 5: Review on open (D4)

Narrow spend-charge read; server action in `src/app/finances/actions.ts`; `BillsView` /
`ReviewDrawer` fetch on open; `bills/page.tsx` drops the call.

## Task 6: Insights tidy (D5) and split aggregate (D6)

`dashboardQueries.ts`; `TRANSACTION_LIST_COLUMNS` in `src/lib/finances/queries.ts`.

## Task 7: Identify and remove the Register's second request (D7)

`register/page.tsx`, `FinancesView.tsx`, `useRegisterSource.ts`. Record the cause first.

## Task 8: Register window and whole-view facts (D8, D9)

`registerDateBound` (+ tests) in `registerQuery.ts`; `loadRegisterPrepared` and the page in
`queries.ts` / `register/page.tsx`; the assignability subset and count/years reads.

## Task 9: Facets on demand (D10)

`RegisterIndex`, a facets action, `useRegisterSource.ts`, the column menu's first open.

## Task 10: Verify, freeze, update roadmap

Run D13 in full; fill the verification table; re-measure production; mark frozen; note under
Financial planning in `agent-os/product/roadmap.md`. Follow-ups: Track-as-bill draft,
Scenarios, Insights windowing.

One commit per task, pushed to `master`.

> While this spec is **active**, a material change to requirements, design or scope updates
> the relevant section and appends to **Changes from original plan**. Skip pure
> implementation detail. Freeze when verified.
