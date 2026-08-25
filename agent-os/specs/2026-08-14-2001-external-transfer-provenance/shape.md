# External-transfer provenance — Shaping Notes

**Status: frozen / complete** (2026-08-25)

## Scope

Make reported cash flow reconcile with the statement-anchored series, and give every large
inflow a named source. Three strands:

1. **Cash-flow identity** — external transfers surfaced as their own series, so
   `statement net = net + external transfers + residual` is visible on the chart.
2. **PayPal as enrichment** — parse 25 statements to name the checking-funded purchases and
   the inbound gifts; no PayPal account, no inserted rows.
3. **Coinbase as an account** — import the full 95-row history so the $3,961.53 arriving in
   checking is a transfer from a visible account rather than mystery income.

### Out of scope

- Envelopes (still the next roadmap item).
- **PenFed import** — the remaining unattributed source. Named as a follow-up, not built.
- Historical BTC market-value marks; quantity + transaction price only.
- Rewriting the Recharts charts on interactive reports.
- The June 2025 Capital One reprint gap (already a known follow-up elsewhere).

## How the discrepancy was found

The dashboard reported −$20k of cash flow over two years, which Lee flagged as implausible:
cards paid in full, FICO 796, no accumulated savings. The axiom that average cash flow must
be near zero when balances are near zero is what forced the audit.

Measured against the database rather than reasoned about:

| Figure                              | Value        |
| ----------------------------------- | ------------ |
| App net (`income − spend`)          | −$21,989.47  |
| `external_transfer` over the window | +$15,462.30  |
| Sum                                 | −$6,527.17   |
| Statement position change           | −$6,676.67   |
| **Residual**                        | **−$149.50** |

$149.50 over 23 months is small enough to call the identity confirmed. The savings
trajectory then explained the rest: $8,192.56 at 2024-08-31, $133.02 by 2025-03-31, and
roughly flat since. Two regimes, not 24 months of bleeding.

## Decisions

- **PayPal is a payment rail.** 276 of 304 purchases are card-funded and already on Capital
  One with merchant names. An account import would double-count ~$31,753. Rejected in favour
  of enrichment.
- **Net keeps meaning `income − spend`.** Folding external transfers into net would make a
  crypto liquidation indistinguishable from a paycheck and destroy the residual's value as a
  diagnostic. The third-series option keeps both truths.
- **Outbound PayPal is unconditionally spend** — Lee never carries a balance, so a rule
  suffices and no per-row storage is needed for the cash-flow fix.
- **Inbound PayPal needs per-row provenance**, but there are only 4 such rows.
- **Coinbase net BTC is zero**, so the import buys provenance, not net worth.
- **Supersession is conditional, not blanket.** `transfers.ts` kept PayPal and PenFed
  external because their contents were unobservable. That reasoning still holds for PenFed;
  it no longer holds for PayPal and Coinbase. Only the latter two change.

## Context

- **Visuals:** None.
- **Source data:** 25 PayPal PDFs (`statement-{2024,2025,2026}.zip`, Jul 2024 – Jul 2026),
  Coinbase CSV (95 rows, 2020-09-22 → 2026-02-03).
- **Known gap:** the two largest PayPal deposits ($4,625.17 on 2024-02-02 and $7,000.00 on
  2024-03-21, **$11,625** together) fall before the supplied statements. They must be
  reported as unresolved rather than quietly bucketed.
- **References:** see `references.md`.
- **Product alignment:** Roadmap § Financial planning. Extends the shipped import/insights
  work; envelopes remain **Next**.

## Standards Applied

- **development/testing** — the parsers and the cash-flow identity are pure logic in
  `src/lib/**`, the highest-value place to test; the new table needs a cross-user
  integration test. `npm run smoke` after the `src/app/**` changes.
- **development/clean-code** — parsing stays in `lib`, components never touch the db, every
  mutation takes `userId`.
- **development/security** — the new resolutions table is user-scoped like every other
  finance table; ownership proven before any write.
- **development/commits** — one logical change per commit; the root cause stated in the body.
- **components/ux-principles** — the chart and its subtitle must state the identity plainly
  rather than implying agreement that cannot hold.
- **database/migrations** — drizzle-kit generated with its snapshot, never hand-written.
- **api/agent-tools** — `get_cash_flow` gains the two fields; the description must tell an
  agent how the terms relate so it does not re-derive the same wrong conclusion.
