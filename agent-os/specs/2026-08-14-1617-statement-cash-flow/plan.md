# Statement-anchored cash flow

**Status: frozen / complete** (2026-08-14)  
Spec folder: `agent-os/specs/2026-08-14-1617-statement-cash-flow/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1524-statement-reconcile/` — same bookends, same
  headline rule (latest close + later txs), same “do not rewrite `amount`.”
- **Extends:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` — same
  `/finances/insights`, same `cashFlow()` for the transaction series, same hand-rolled SVG.
- **Extends:** `agent-os/specs/2026-08-14-1208-finance-agent-tools/` — agent numbers =
  page numbers; extend `get_cash_flow` rather than add a eighth tool.
- **Supersedes:** reconcile spec decision that “historical cash-flow / asset-debt series
  stay transaction-reconstructed” and its follow-up “statement-anchored historical debt
  series.”
- **Does not supersede:** envelopes; interactive-reports Recharts charts; insert-or-skip;
  pay-period axis; baseline vs one-off.

## Context

The 2025 Capital One card PDFs are in Dropbox (`Statement_MM2025_3448.pdf`, all 12).
Imported locally 2026-08-14: **459 txs created, 377 skipped, 11 snapshots created, 1
skipped.** The year-long 2024-12-21 → 2025-12-22 hole is gone. `Statement_062025_3448.pdf`
is a reprint of May (Apr 21–May 21) — same filename-vs-period trick as 2023 — so one
month remains: **2025-05-21 → 2025-06-21**, official close moved +$228.91. Headline
stays −$301.20.

Transaction cash flow is still the only monthly series. It can drift (holes, unpaired
transfers, classification). Official bookends cannot invent spend, but they _can_ say
what the household position was at each month-end. Showing both, and their difference,
is how we find the next data bug.

Card cycles close ~the 21st; 360 statements are calendar months. A naive “sum of
statement (close−open) whose periodEnd falls in July” will not match July transactions
even with perfect data. Month-end **position** (last close on or before that day, plus
imported txs after it through that day) is calendar-aligned. Household change then
matches transaction net when every transfer has both legs and there is no hole.

**Achieve had no finance module.** Roadmap § Financial planning — not a new item.
Envelopes stay next.

## Decisions

1. **Keep transaction cash flow as the primary series** (income/spend bars, pay-period,
   baseline vs one-off, trailing average).
2. **Add statement-anchored household position and its bucket-to-bucket change.**
   For `asOf` = bucket `endKey` (month-end, or pay-period end):
   - Per account: latest statement with `periodEnd ≤ asOf`, then `closing + sum(txs
with periodEnd < date ≤ asOf)`. No statement → sum of txs with `date ≤ asOf`.
   - Household position = sum across imported accounts (module sign).
   - Statement net for a bucket = `position[end] − position[previous end]`. First
     visible bucket has net = null (no prior position in the _full_ history series
     before it — actually compute from full history so the first visible month still
     has a net, same trick as trailing-12).
3. **Discrepancy** per bucket: `transaction netCents − statementNetCents`. Near zero
   when transfers net out and there is no hole. A residual is the diagnostic.
4. **Chart:** keep the existing SVG. In **net** mode, overlay statement net as a
   second line (or second bar) on the **same y-axis**. In in/out and bills-vs-rest,
   show a compact discrepancy readout under the chart (do not add a third bar).
   Hover/tooltip names both nets and the delta.
5. **Holes stay visible.** A hole’s official jump appears in statement net; missing
   txs do not appear in transaction net. The delta should spike there (e.g. June
   2025, +$229).
6. **MCP:** `get_cash_flow` points gain `statementNetCents`, `statementPositionCents`,
   `discrepancyCents`. Description: do not blend the two nets. `get_finance_overview`
   coverage already has holes/mismatches.
7. **No schema change.** Pure compute in `src/lib/finances`.
8. **Out of scope:** rewriting Recharts charts; envelopes; Plaid; deleting the June
   reprint; inventing the missing June cycle; changing headline current balance.

## Acceptance criteria

- [x] `position(asOf)` for an account with a statement equals `closing + later txs`
      through `asOf`. Fixture: Jul 21 close −$201.14 + $100 of later July txs →
      Jul 31 position −$301.14.
- [x] Household statement net over a month with only an internal transfer is 0.
      A card purchase matches spend on the statement series.
- [x] A planted hole produces a statement-net spike and a nonzero discrepancy;
      transaction net stays 0.
- [x] Insights net chart shows both series on one axis (dashed statement line).
      In/out mode still works; a residual readout points at Net.
- [x] `get_cash_flow` points include statement fields. Second-user isolation
      still holds.
- [x] 2025 PDFs imported locally; year-long hole gone; June 2025 reprint/gap
      remains. Chart draws statement net across 24 months.
- [x] Reclassify does not change statement position.
- [x] Unit tests pass. `npm run smoke` (53 routes). Browser: Insights desktop
      Net + 2 years, and compact.

## Verified as built

- Dashed statement-net overlay on the Net chart, same y-axis as transaction bars
  and the trailing-average line. Legend: Statement net.
- `analyzeInsights` zips `statementCashFlow` onto each bucket after computing
  over full history then slicing.

## Follow-ups (new work — not amendments to this frozen spec)

- Real June 2025 Capital One cycle if a non-reprint PDF turns up.
- Statement-anchored _levels_ (assets vs debt over time), not just the first
  difference.
- Envelopes.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

---

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-14-1617-statement-cash-flow/` with `plan.md`
(**Status: active**), `shape.md`, `standards.md` (testing, clean-code, security,
dates, ux-principles, agent-tools), `references.md`. No visuals.

## Task 2: Pure statement position and cash flow

`src/lib/finances/statementCashFlow.ts` + `.test.ts`.

- `accountPosition(statements, txs, asOf) → cents`
- `householdPosition(...) → { totalCents, byAccount }`
- `statementCashFlow(statements, txs, buckets) → { bucket, positionCents, netCents }[]`
  Net is change from the previous bucket’s position; first bucket of the _full_
  series may be null; when we compute on `fullBuckets` then slice (same as
  `cashFlow`), every visible month has a net.

Fixtures: transfer nets to 0; purchase matches spend; hole spikes discrepancy;
post-statement txs move month-end without waiting for the next PDF.

## Task 3: Insights — both series + discrepancy

- `analyzeInsights` loads statements (page already has them) and attaches
  `statementFlow` / per-point `statementNetCents` / `discrepancyCents`.
- `CashFlowChart`: net mode overlays statement net on the same axis (distinct
  stroke, not a second scale). Tooltip: transaction net, statement net, delta.
  In/out and bills-vs-rest: a one-line discrepancy summary, not extra bars.
- Coverage / chart subtitle: one sentence that a residual after transfers net
  out is a hole or a classification miss.

## Task 4: MCP

Extend `cashFlowPointSchema` and `get_cash_flow` totals with statement fields.
Update tool description. Integration: second user empty; figures match the
page composition. Regenerate `docs/agent-api.md`.

## Task 5: Verify, freeze spec, update roadmap

Drive Insights (month + pay-period, net + in/out). Confirm June 2025 delta.
Smoke after app-route changes. Freeze. Roadmap: note dual cash flow under
Financial planning; envelopes remain next. Follow-ups: the missing June 2025
cycle if a real PDF turns up; statement-anchored asset/debt _levels_ chart
(this spec is cash flow / position change).

---

While this spec is **active**, when we make a material change to requirements,
design, or scope, update the relevant sections and append to **Changes from
original plan**. Skip pure implementation details. Freeze when verified.
