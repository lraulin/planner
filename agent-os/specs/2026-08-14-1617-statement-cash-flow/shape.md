# Statement-anchored cash flow — Shaping Notes

**Status: frozen / complete** (2026-08-14)

## Scope

Show two monthly cash-flow series on Insights: the existing transaction net, and a
statement-anchored household position change. Their difference is the diagnostic.

2025 Capital One PDFs arrived and were imported locally (11 new snapshots; June file is
a May reprint). One month still missing: 2025-05-21 → 2025-06-21.

### Out of scope

- Envelopes, Plaid, inventing the missing June cycle
- Rewriting Recharts charts
- Changing the headline current-balance rule
- A second y-axis

## Decisions

- Transaction series stays primary.
- Statement series is month-end (or pay-period-end) position, then first difference.
- Position = last official close on or before `asOf` + imported txs after that close
  through `asOf`.
- Discrepancy = transaction net − statement net.
- Net chart overlays both on one axis. Other chart modes get a one-line readout.
- MCP extends `get_cash_flow`; no new tool.

## Context

- **Visuals:** None
- **References:** See `references.md`
- **Product alignment:** Roadmap § Financial planning. Envelopes stay next.

## Standards Applied

- development/testing, clean-code, security, dates
- components/ux-principles — one axis, no dual scale
- api/agent-tools — same numbers as the page
