# Statement reconcile + sanity checks — Shaping Notes

**Status: active**

## Scope

Make the finance numbers trustworthy enough to act on. The module already stores official
statement snapshots and a full transaction register; it does not compare them, and it
displays `SUM(all rows)` as if that were the bank’s current balance.

This spec:

- Reconciles each statement period against the register (`opening + rows = closing`).
- Detects mid-history holes (missing cycles), not only late-starting accounts.
- Uses the latest statement close plus later transactions as the headline current balance.
- Warns when that disagrees with the ledger sum — never rewrites `amount`.
- Adds `/finances/statements` so a person can see the snapshots and the check.
- Gives MCP the same facts so the next cash-flow analysis is not flying blind.
- Investigates the live Capital One −$2,368 vs statement −$201.14 drift and fixes
  _duplicates or mis-tags_ if found. A missing period is disclosed, not invented.

### Out of scope

- Envelopes / budgets
- Plaid, OFX, crawlers, bank-site scraping
- Post-statement Capital One CSV (the issuer will not export after close)
- Synthetic opening-balance plugs to make `SUM(amount)` agree
- Auto-deleting without a proven duplicate
- Re-anchoring historical cash-flow / asset-debt charts (active interactive-reports spec)
- Amazon order matching
- Hosting original statement PDFs (PII)

## Decisions

- Headline balance = latest `closingBalance` + txs with `transactionDate > periodEnd`.
  No statements → keep `SUM(all rows)`.
- Ledger sum is the diagnostic. Show both figures when they disagree.
- Reconcile is computed on read. No new tables.
- Period membership is `periodStart ≤ transactionDate ≤ periodEnd`.
- 0-cent tolerance. Post-statement activity is expected mid-cycle, not an error.
- A gap is not a bug to paper over. The 2025 Capital One card PDF hole is the leading
  suspect for the drifted card balance.
- MCP: extend `get_finance_overview`; add `list_statements`. Same numbers as the page.
- Page order: Register · Statements · Insights · Orders.
- No visuals. Follow Register / Orders / Insights.

## Context

A Grok cash-flow conversation reported ~−$20.5k over 24 months and a Capital One card
still carrying ~$2,368. That did not match lived experience (cards paid in full most
months, savings already low after the wedding, occasional $2k gifts from family). Live
apps then showed Capital One $311.20, Chase $204.27, $0 minimum due, FICO 796.

The first explanation (“balances are stale pending a new CSV”) was wrong. The Jul 21
Capital One statement is already imported (New Balance $201.14) and re-import correctly
added nothing. `latestClosingBalanceCents` holds ~−$201; the register strip never reads
it. There is no stored balance field that import failed to update — `balanceCents` is
`SUM(amount)` from the founding spec.

`coverageGap` only compares each account’s first-seen date. Capital One card statements
skip all of 2025 (CSV starts 2025-08-10). That hole cannot appear as a late start once
2019–2024 rows exist. It is exactly the kind of gap that would leave older purchases in
the sum and omit a year of net paydown.

The Chase and Capital One card specs both deferred “Statements UI / reconciliation
screen.” The `finance_statements` schema comment already names the rows as bookends
“a later reconcile compares the register against.” `listStatements` exists with no page.

- **Visuals:** None
- **References:** See `references.md`
- **Product alignment:** Roadmap § Financial planning. This is trust-the-numbers work,
  the precondition already set before Plaid. Envelopes stay next. Not a new roadmap item.

## Standards Applied

- development/testing — pure reconcile beside `reconcile.ts`; integration + second user
  on any new query; no React component tests
- development/clean-code — logic in `src/lib/finances`; pages/actions stay thin
- development/security — `userId` on every query; register new reads in
  `crossUserReads.integration.test.ts`
- development/dates — statement periods and `transactionDate` are `YYYY-MM-DD` labels;
  `shiftDateKey` / `daysBetweenKeys` for holes, never `new Date("YYYY-MM-DD")`
- components/navigation — new Finances page in `pages.ts`, never a hard-coded tab
- components/data-grid — statement list rides the shared grid
- components/ux-principles — inline warning, no modal for a mismatch
- components/responsive — list + detail sheet below `md`
- api/agent-tools — one registry, compact outputs, unknown fields rejected
