# Statement reconcile + sanity checks

**Status: active**

Spec folder: `agent-os/specs/2026-08-14-1524-statement-reconcile/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — sign rule (positive = money in), insert-or-skip, fingerprint + occurrence, `numeric` sums in SQL. The ledger remains `SUM(amount)`. This spec only changes which figure is the _headline_ current balance.
- **Extends:** `agent-os/specs/2026-08-12-1540-chase-statement-import/` — `finance_statements` as “the bookend a later reconcile compares the register against.” Delivers the deferred Statements UI.
- **Extends:** `agent-os/specs/2026-08-14-1430-capitalone-card-statements/` — same snapshots; known 2025 PDF hole (CSV from 2025-08-10 only).
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — coverage stays a UI element; classification still never changes `amount`.
- **Extends:** `agent-os/specs/2026-08-14-1208-finance-agent-tools/` — one source of truth; agent numbers match the page.
- **Extends:** `agent-os/specs/2026-08-13-0747-module-pages/` — add a built Finances page.
- **Supersedes:** Insights decision that “reconciliation against statements is out of scope (interest/fees only).”
- **Supersedes:** `coverageGap` as late-start-only. Mid-history holes (missing cycles on an account that already has statements) are first-class.
- **Supersedes:** headline account balance = `SUM(all rows)`. Headline is statement-anchored when a snapshot exists.
- **Supersedes:** Chase / Cap One card “no statements page.”
- **Does not supersede:** insert-or-skip; do not rewrite `amount`; interactive reports (still active — do not rewrite its new charts); envelopes; Plaid.

## Context

A cash-flow analysis over the imported history reported ~−$20k over 24 months and a Capital One card balance of ~−$2,368. Live apps show Capital One ~$311 and Chase ~$204, $0 minimum due, FICO 796. The latest imported Capital One card statement (≈ Jul 21, 2026) says Previous $700.63, Payments −$4,989.73, Transactions +$4,490.24, New Balance $201.14. Re-import correctly added nothing.

There is **no stored `balanceCents` that import failed to update**. Displayed balance is `SUM(finance_transactions.amount)`. `latestClosingBalanceCents` is already on the newest `finance_statements` row (~−$201) and is unused for display. The schema comment already names statements as reconcile bookends; `listStatements` exists with no page.

`coverageGap` only compares each account’s first-seen date. It cannot see a hole in the middle. Capital One card PDFs skip 2025 (67 files, Aug 2019–Jul 2026 with 2025 missing; CSV starts 2025-08-10). That discontinuity is the leading suspect for ledger vs statement drift: 2019–2024 purchases sit in the sum, 2025 net change does not.

Roadmap § Financial planning — not a new item. This makes CSV + statements trustworthy (the precondition the roadmap already set before Plaid). Envelopes stay next.

**Achieve had no finance module.**

## Decisions

1. **Headline current balance is statement-anchored.** `latest closing + transactions with date > that periodEnd`. If the account has no statements, keep `SUM(all rows)`.
2. **Ledger sum stays the diagnostic.** When it disagrees with the anchored figure, show both and a warning. Never silently rewrite `amount`. Never insert a synthetic opening-balance plug to make the sums agree — that would hide the hole.
3. **A gap is not a bug to paper over.** Missing cycles (2025 Cap One card PDFs) are disclosed. Duplicates or mis-tagged flows, if investigation finds them, are fixed (delete proven extras via existing register delete; reclassify flows). Do not invent missing spend.
4. **Reconcile is computed on read.** No new tables, no migration.
5. **Period math (module sign, integer cents):**
   - A register row belongs to a statement iff `periodStart ≤ transactionDate ≤ periodEnd` on that account.
   - Period balances: `opening + sum(period rows) === closing` (0-cent tolerance).
   - Chain: calendar gap when `periodEnd[n]` is not the day before `periodStart[n+1]`; balance gap when `closing[n] !== opening[n+1]`.
   - Post-statement activity (txs after latest `periodEnd`) is expected mid-cycle — label “as of {date}, plus N later rows,” not an error.
6. **Historical cash-flow / asset-debt series stay transaction-reconstructed.** Do not re-anchor every chart in this spec (would collide with the active interactive-reports work). The coverage panel must say which windows sit on a hole so those series are not trusted across it.
7. **Statements page** at `/finances/statements`, Finances underline order: Register · Statements · Insights · Orders. DataGrid of snapshots; select a row to see official totals vs imported rows for that period. Extracted fields only — do not host original PDFs (PII).
8. **MCP:** extend `get_finance_overview` with anchored vs ledger, mismatch, and the new coverage shape. Add `list_statements` (read, `domain: "finances"`) so an agent can pull official period totals. Same numbers as the page.
9. **Out of scope:** envelopes; Plaid / OFX / crawlers / bank-site scraping; post-statement Capital One CSV (issuer will not export after close); auto-deleting without a proven duplicate; rewriting Insights’ new charts; Amazon matching.

## Acceptance criteria

- [ ] For an account with statements, the register strip, Insights, and `get_finance_overview` show the same headline: latest closing + later txs. A fixture whose ledger sum is −$2,368 and whose latest close is −$201.14 with no later rows headlines −$201.14 and warns.
- [ ] An account with no statements still headlines `SUM(all rows)` and does not warn.
- [ ] Reclassify still leaves every account’s `SUM(amount)` byte-identical. Anchored headline is unaffected by classification.
- [ ] Each stored statement reports `registerDeltaCents` (`opening + period rows − closing`). A matching period is 0; a planted extra or missing row is not.
- [ ] A missing cycle (e.g. Jul 2024 close then Jan 2026 open) appears as a hole: date range, previous close, next open, `discontinuityCents`.
- [ ] Unpaired internal-transfer legs remain listed; they are not called “unitemized card spend” when the opposite account now itemizes.
- [ ] `/finances/statements` lists snapshots (account, period, open/close, due, activity totals, reconcile status). Selecting a period lists the imported rows that produced the register side. Missing cycles are visible, not only stored rows.
- [ ] Re-importing an already-loaded statement still creates 0 transactions and 0 statements (insert-or-skip unchanged).
- [ ] `list_statements` over MCP returns the same period totals and reconcile flags as the page. A second user sees none of the first user’s statements or mismatches.
- [ ] Insights “What this dashboard cannot see” names mid-history holes and balance mismatches, not only late-starting accounts.
- [ ] Live Capital One headline matches the Jul 21 close plus any imported txs after that date (≈ −$201 plus post-statement spend), not −$2,368. The 2025 PDF hole is visible. If investigation finds duplicates, they are gone; if it finds only the hole, no rows were invented.
- [ ] `npm run test:unit` passes. Integration tests actually ran (no skip warning) after query/mutation changes. After `src/app/**` changes, `npm run smoke` against the running dev server.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1524-statement-reconcile/` with:

- `plan.md` — this plan, **Status: active**, empty Changes table
- `shape.md` — scope, locked decisions, conversation context (the −$20k analysis vs lived experience; stale vs drifted balance; 2025 PDF hole; no stored balance field)
- `standards.md` — full text of: `development/testing`, `development/clean-code`, `development/security`, `development/dates`, `components/navigation`, `components/data-grid`, `components/ux-principles`, `components/responsive`, `api/agent-tools`
- `references.md` — governing specs above; `listStatements` / `listAccounts`; `coverageGap`; Orders page as sibling “imported source data”; schema comment on `finance_statements`
- No `visuals/`

## Task 2: Pure reconcile logic

New `src/lib/finances/reconcile.ts` + `reconcile.test.ts`. Inputs: statements + register rows for one user (already-loaded shapes, no DB). Outputs:

- Per account: `ledgerBalanceCents`, `anchoredBalanceCents`, `latestStatement` (periodEnd, closing), `postStatementCount`, `mismatchCents`
- Per statement: `registerSumCents`, `registerDeltaCents`, row count
- `holes[]`: `{ accountId, afterPeriodEnd, beforePeriodStart, previousClosingCents, nextOpeningCents, discontinuityCents }`
- `unpairedTransfers[]`: reuse `effectiveFlow` / `transferGroupId` (do not fork pairing)

Rewrite `coverageGap` in `analytics.ts` (or have it call reconcile) so it returns late starts **and** mid-history holes **and** balance mismatches. Keep `unitemizedCents` but only for unpaired outflow legs that still stand in for a card that does not itemize in that window.

Fixtures: a $0-start card that stays consistent; a planted duplicate that produces a nonzero `registerDeltaCents` and a ledger/anchor mismatch; a 2024-then-2026 statement pair that produces one hole; post-statement txs that change the headline but are not an error.

No schema change.

## Task 3: Investigate live data and fix what is actually wrong

Using Task 2 against the real register (local Postgres / the user’s imported accounts):

1. For Capital One `•••3448`, print ledger sum, latest statement close (expect −$201.14), post-statement txs, mismatch, holes.
2. Walk the statement chain: find the 2024→2026 jump and any period whose register delta ≠ 0.
3. Search for true duplicates (same account + date + signed amount + folded description with a higher occurrence than the statement/CSV overlap should allow). The SBARRO same-day pair is a legitimate duplicate — do not delete it.
4. **If duplicates:** delete the extras through the existing `deleteTransaction` path (user-scoped). Do not write a new bulk-delete.
5. **If only the hole:** do not insert rows. The anchored headline + hole warning is the fix.
6. **If mis-tagged flows throw cash-flow off:** fix pairing/rules, then `reclassify`. Never touch `amount`.
7. Record the finding (cause + what was done) in this spec’s Changes table and shape.md. That is the record of whether −$2,368 was a hole, duplicates, or both.

## Task 4: Statement-anchored balances everywhere the number is shown

`FinanceAccountRow`:

- `balanceCents` — headline (anchored if any statement exists, else ledger)
- `ledgerBalanceCents` — `SUM(amount)`
- `statementClosingCents` / `statementPeriodEnd` — null when none
- `balanceMismatchCents` — `ledger − headline` (0 when no statement)

`listAccounts` still sums in SQL. Join (or second query) the newest statement per account; add post-statement sum in SQL (`transaction_date > period_end`). Do not sum in JS.

Update:

- Register `AccountBalances` strip — headline; if mismatch, muted “ledger {sum}” and a warning treatment (`text-priority-a` / title tooltip stating the two figures and the statement date)
- Insights / carrying-cost consumers that display a current card balance
- `get_finance_overview` and `get_debt_summary` account snapshots — `balanceCents` is the headline; include `ledgerBalanceCents` and `mismatchCents` so the agent cannot miss the disagreement

Tests that pinned `balanceCents === SUM(imported amounts)` move that assertion to `ledgerBalanceCents`. Reclassify integration still asserts `SUM(amount)` is unchanged.

## Task 5: Statements page

- Register `{ id: "statements", label: "Statements", segment: "statements", status: "built" }` on `finances` in `src/lib/navigation/pages.ts`. Order: register, statements, insights, orders. Update `pages.test.ts`.
- `src/app/finances/statements/page.tsx` — `force-dynamic`, `getCurrentUserId`, load statements + reconcile (thin page; logic in `src/lib/finances`).
- `src/components/finances/StatementsView.tsx` — DataGrid of statement rows (account, period, open, close, payments/credits, purchases, interest, fees, reconcile status). Defaults: newest period first; group by account then year if that is cheap with existing group-by. Persist via `useGridState` / the finances statements grid scope.
- Selecting a row shows that period’s official totals vs `registerSumCents` / `registerDeltaCents` and the imported transactions in range (not a second DataGrid if a compact list is enough; a filtered-in-place list is fine).
- Holes render as non-statement rows or a banner-per-account above the grid — visible without opening a row. Copy names the missing range and the close/open discontinuity.
- No drawer unless a period grows into a full-record editor (it should not — statements stay insert-or-skip, not user-editable).
- Compact: list + detail sheet per `components/responsive.md`. 44px taps.

## Task 6: Surface gaps on Insights and MCP

- Insights panel “What this dashboard cannot see”: mid-history holes, balance mismatches, leftover unpaired legs, unclassified count. Drop or reword the stale “card itemization starts 2025-08-10 / $109k unitemized” line when that is no longer the truth (the card now itemizes from 2020 except the 2025 hole).
- Do not rewrite CashFlowChart, Sankey, or spending trends.
- `get_finance_overview.coverage` matches the new shape. Description on `get_spending_breakdown` / `get_cash_flow` warns about holes, not only `completeFrom`.
- New tool `list_statements`: args `accountId?`, `from?`, `to?`, `limit` (default 50, max 200), `offset`. Returns compact period rows (account, dates, open/close, activity, `registerDeltaCents`, hole flag) plus `pageInfo`. Effects: read. Exposure: domain. Reject unknown fields.
- Integration: second user empty; overview headline matches the page; regenerate `docs/agent-api.md` from the registry.

## Task 7: Verify, freeze spec, update roadmap

- Drive Register, Statements, Insights in the browser (desktop + compact): Capital One headline, mismatch warning, 2025 hole, a period that reconciles to 0, drill-through to rows.
- `npm run test:unit`; integration suites actually ran; `npm run smoke` after app-route changes.
- Confirm acceptance criteria. Update plan/shape for as-built drift. Complete **Changes from original plan**.
- Mark **Status: frozen / complete** (date). Follow-ups (not this spec): 2025 Cap One card PDFs if they turn up; post-statement refresh (issuer CSV stops at close; Plaid later); statement-anchored _historical_ debt series; envelopes.
- Roadmap § Financial planning: note that statement snapshots are now the current-balance source and that coverage includes mid-history holes. Envelopes remain next.

---

While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
