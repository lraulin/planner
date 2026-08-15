# External-transfer provenance: PayPal enrichment + Coinbase import

**Status: active**  
Spec folder: `agent-os/specs/2026-08-14-2001-external-transfer-provenance/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-14-1617-statement-cash-flow/` — keeps both series on
  one axis and the discrepancy-as-diagnostic framing.
- **Extends:** `agent-os/specs/2026-08-12-1048-finances-csv-import-register/` — importer
  shape (`looksLikeX` / `parseX`, insert-or-skip, occurrence-counted dedup).
- **Supersedes:** `agent-os/specs/2026-08-12-2031-finances-insights-dashboard/` decision 1,
  **only** for PayPal and Coinbase rows. PenFed stays `external_transfer`.
- **Supersedes:** the statement-cash-flow claim that a residual is "a hole or a
  classification miss" — a residual is also a legitimate external transfer.

## Context

The Insights cash-flow chart reports **−$21,989** net over Sep 2024 – Jul 2026. The
statement-anchored series on the same chart reports **−$6,677**. Both are computed from the
same data, and the gap is not noise — it is **$15,462 of `external_transfer`**, a flow that
`incomeCentsOf` / `spendCentsOf` (`src/lib/finances/analytics.ts:138-151`) count as neither
income nor spend, so it vanishes from `netCents` entirely.

That flow is not a rounding artifact. It is tax refunds, HSA distributions, Coinbase sale
proceeds, cheque deposits, and **$4,000 of family support from Dennis Raulin**. Dropping it
made two years read as relentless overspending when the true figure is roughly
**−$285/month**, and the real shape is two regimes, not one:

| Window              | Position change | Per month                |
| ------------------- | --------------- | ------------------------ |
| Sep 2024 – Mar 2025 | +$8,100 → −$594 | **−$1,240** savings burn |
| Apr 2025 – Jul 2026 | −$594 → +$1,423 | **+$126** positive       |

`classify/transfers.ts:63-72` recorded the original reasoning honestly: PayPal and PenFed
rows stay `external_transfer` because "treating them as income would invent earnings we
cannot see." That was correct **when we could not see them.** We now have 25 PayPal
statements (Jul 2024 – Jul 2026) and a full Coinbase history (95 rows, 2020-09 → 2026-02).
The precondition for that decision no longer holds, and this spec supersedes it for the
sources we can now read — not for PenFed, which remains unimported.

Intended outcome: net cash flow that reconciles to the statement line by a stated identity,
with every large inflow attributable to a named source.

**Achieve had no finance module.** Roadmap § Financial planning — not a new item; envelopes
stay next.

## Decisions

1. **PayPal is a payment rail, not an account.** No PayPal account, no inserted rows. Of 304
   purchases in the statements, **276 are card-funded** and already sit on Capital One as
   `PAYPAL *X` / `PP*X` with merchant names; importing them would double-count ~$31,753.
2. **Net stays `income − spend`.** External transfers become an explicit third series so the
   reconciliation identity is visible on the chart:
   `statement net = net + external transfers + residual`.
   On real data: `−21,989.47 + 15,462.30 = −6,527.17` vs statement `−6,676.67`, residual
   **−$149.50** over 23 months. The residual is the diagnostic; today it is buried.
3. **Coinbase is a real account** (`kind: investment`). Net BTC held is **0.00000000**, so it
   adds nothing to current net worth — the value is provenance. The 3 withdrawals pair as
   `internal_transfer` with the checking deposits, so $3,961.53 stops reading as mystery
   income. The 77 buys stay `external_transfer` (funded from PenFed, unimported).
4. **`PAYPAL TO LEE RAULIN` withdrawals are always spend.** Lee never carries a PayPal
   balance, so every outbound row funds a purchase. This is a `CLASSIFY_RULES` entry, not
   per-row matching — it fixes the cash-flow hole without any new storage.
5. **Only inbound PayPal rows need per-row provenance** — 4 rows, $15,625.17. Two resolve to
   `General Payment: Dennis Raulin`; two (Feb/Mar 2024, **$11,625**) predate the supplied
   statements and stay unresolved until Jan–Jun 2024 is exported.
6. **No `amount` is ever rewritten.** All corrections land in the derived layer
   (`derived_flow`, `derived_category`) or `CLASSIFY_RULES`, keeping insert-or-skip intact.

### Out of scope

Envelopes. PenFed import. Historical BTC market-value marks (quantity + transaction price
only). Rewriting the Recharts charts. The June 2025 Capital One reprint gap.

## Acceptance criteria

- [ ] Insights net mode shows external transfers as a distinct series; the subtitle states
      the identity rather than claiming the two series "should agree".
- [ ] Over Sep 2024 – Jul 2026 the residual is under ~$200, and the page shows it.
- [ ] The 47 `PAYPAL TO LEE RAULIN` withdrawals classify as `spend` (−$3,564.75 all-time;
      −$1,018.26 within statement coverage), not `external_transfer`.
- [ ] `PP*SPOTIFY*<hash>` collapses to one merchant; likewise the `PADDLE.NET` variants.
      Spotify stops appearing as 14 merchants.
- [ ] Both $2,000 deposits are attributed to Dennis Raulin. The Feb/Mar 2024 pair is
      reported as unresolved with a named reason, not silently bucketed.
- [ ] Coinbase imports 95 rows; net BTC reads 0.00000000; the 3 withdrawals pair with the
      checking deposits by `transfer_group_id`.
- [ ] Re-running any import inserts nothing new (insert-or-skip holds).
- [ ] Second user sees none of it — cross-user integration test on every new query/mutation.
- [ ] `npm run test:unit` (with Postgres up — check for the skip warning), typecheck, lint,
      and `npm run smoke` after any `src/app/**` change.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code
polish.

| #   | Change                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `discrepancyCents` is **replaced by** `residualCents`, not joined by it.                                                                                      | The plan said "extend `get_cash_flow` with `externalTransferCents` and `residualCents`", implying both survive. Keeping `net − statement` beside the residual would keep the misleading number on the page and in the tool: it is dominated by external transfers and stays large for a healthy dataset, which is the exact reading that started this work. |
| 2   | The window reconciliation is computed in `analyzeInsights` from the **rows**, unlevelled, rather than by summing the levelled `flow` points in the component. | Discovered on real data: with "Level bills" on, net moved by $2,170 while statement movement cannot move at all, so the identity reported a residual that was an artifact of the smoothing. Levelling is presentation; "did the books balance" is about money that actually moved. Also puts the logic in `lib` where the clean-code standard wants it.     |
| 3   | The reconciliation sums over the **bucket span**, not `range`.                                                                                                | `range` can stop mid-month at the last import (9/1/2024 – **8/10**/2026), and pairing a part-month of rows against a whole month of official movement invents a residual.                                                                                                                                                                                   |
| 4   | `ChartLegend` gained a `dash` option.                                                                                                                         | Two line series now share `--chart-average`/`--ink` territory; a solid swatch for a dotted series makes the legend a lie, and the module's own rule is that identity is never colour alone.                                                                                                                                                                 |

---

## Task 1: Save spec documentation

Create this folder with `plan.md` (**Status: active**), `shape.md`, `standards.md`
(development/testing, clean-code, security, commits; components/ux-principles;
database/migrations; api/agent-tools), `references.md`. No visuals.

## Task 2: Cash-flow reconciliation identity

Pure-logic first, since this is where a wrong answer looks plausible.

- `src/lib/finances/analytics.ts` — add `externalTransferCents` to the cash-flow point
  alongside `incomeCents` / `spendCents`. Do **not** change `netCents`.
- `src/lib/finances/insightsAnalysis.ts:134-155` — extend the existing statement zip to
  carry `residualCents = netCents + externalTransferCents − statementNetCents`.
- `analytics.test.ts` — a bucket with a $2,000 external inflow and no income/spend must show
  `net = 0`, `external = 2000`, and a residual of 0 against a statement that moved $2,000.

## Task 3: Insights chart + copy

- `src/components/finances/insights/CashFlowChart.tsx` — third series in net mode; tooltip
  names transaction net, external transfers, statement net, residual.
- `src/components/finances/insights/InsightsView.tsx:361-396` — replace the "They should
  agree" subtitle with the identity. Surface the residual in **every** mode; today it is
  shown only when _not_ in net mode, which is why the mismatch stayed invisible.

## Task 4: PayPal statement parser

- `src/lib/finances/paypalStatement.ts` + `.test.ts`, following `chaseStatement.ts`.
- **Two parser traps, both confirmed in the PDFs:** each file contains a `PAYPAL ACCOUNT`
  and a `PAYPAL BALANCE ACCOUNT` statement and every transaction appears in **both** — parse
  only the first, or everything doubles. Dates wrap mid-token in the text layer
  (`04/20/202` / newline / `5`).
- Extract: date, type (`PreApproved Payment Bill User Payment`, `General Payment`,
  `User Initiated Withdrawal`, `General Credit Card Deposit`), counterparty, amount,
  PayPal txn ID, and the inline funding source (`CAPITAL ONE N.A. - Checking x-2322`).
- Fixtures from the real extracted text, per the `merchant.test.ts` precedent that fixtures
  must be real strings from the feed.

## Task 5: PayPal resolutions → derived layer

- Migration: `finance_payment_resolutions` — `(user_id, source, external_id)` unique, with
  date, amount, counterparty, direction. Generated via drizzle-kit with its snapshot, never
  hand-written.
- Date + signed amount matcher (occurrence-counted, mirroring `matchExisting.ts`;
  `descriptionsMatch` does **not** apply — PayPal says "Pluralsight, LLC" where checking
  says "Withdrawal from PAYPAL to LEE RAULIN INST XFER").
- `classify/reclassify.ts` consumes resolutions before falling back to the
  `external_transfer` default at line 185.
- `CLASSIFY_RULES` additions: `PAYPAL TO LEE RAULIN` → `spend`; `SPOTIFY*<hash>` →
  `Spotify USA Inc`; `PADDLE.NET<digits>` → `Paddle.com Market Limited`. Note that
  `merchant.ts:42-53` already strips `PAYPAL *` and `PP*`, so rules match the residue.
- Integration test with a second user attempting read/change/delete on the first user's
  resolutions and failing at each.

## Task 6: Coinbase importer

- `src/lib/finances/coinbaseCsv.ts` + `.test.ts`; register `looksLikeCoinbaseCsv` /
  `parseCoinbaseCsv` in `import.ts` alongside the existing parsers.
- Header is on **line 4** (preamble: blank, `Transactions`, `User,...`). Types: `Buy`,
  `Sell`, `Send`, `Receive`, `Withdrawal`, `Retail Mgx Dex Trade`, `Retail MGX DEX Send`.
- Withdrawal rows carry `Subtotal` (net to bank, $482.03) and `Total` (gross off the
  platform, $490.62) — the checking deposit matches **Subtotal**; the $8.59 delta is a fee.
- `transfers.ts`: recognise `Withdrawal to Capital One - 360 Chec...` as an internal pair
  with the checking `Deposit from COINBASE` leg. Note the description is **truncated** in
  the CSV, so match on account key + date + amount, not the literal string.
- Buys and Sends stay `external_transfer`; record why in the module comment, matching the
  PenFed precedent.

## Task 7: MCP surface

Extend `get_cash_flow` points with `externalTransferCents` and `residualCents`
(`src/lib/agent/contracts.ts:401`, `financeTools.ts:131-149`). Update the tool description
at `tools.ts:492` — it currently tells the agent not to blend `netCents` and
`statementNetCents` but says nothing about the external-transfer term that explains their
gap. Regenerate `docs/agent-api.md`. Cross-user integration test.

## Task 8: Verify, freeze spec, update roadmap

Import the real files, then confirm on the page and against the DB:

- PayPal: `~/Downloads/statement-{2024,2025,2026}.zip` (25 PDFs)
- Coinbase: `~/Downloads/0b7043a7-…__csv.csv`

Freeze both docs; roadmap § Financial planning gains a line under the shipped-imports list
(envelopes remain **Next**). Follow-ups as new work: **PenFed import** — the last
unattributed source, and the reason 77 Coinbase buys still come from nowhere; **PayPal
Jan–Jun 2024** to resolve the $11,625; historical BTC market-value marks.

## Verification

1. `npm run test:unit` — and check for the Postgres skip warning; the integration tests are
   the only thing proving cross-user isolation on the new table.
2. `npm run lint` and typecheck.
3. Start the dev server, import all 26 files through File ▸ Import.
4. `npm run smoke` (53 routes) — Tasks 3 and 7 touch `src/app/**`, and neither the tests nor
   `next build` execute a `"use server"` module.
5. On `/finances/insights`, 2-year window, Net mode: confirm the three series, and that
   `net + external − statement ≈ −$150`, not −$15,462.
6. Against the DB, confirm net BTC is `0.00000000`, the 3 Coinbase withdrawals carry a
   shared `transfer_group_id` with their checking legs, and no `PAYPAL TO LEE RAULIN` row
   remains `external_transfer`.
7. Re-import one PayPal zip and one Coinbase CSV; confirm 0 rows created.

## Risks

- **The residual is the honesty check.** If it does not land near −$150 after Task 2, the
  identity is wrong somewhere — stop and find it rather than widening a tolerance.
- Task 5's matcher is the one place a silent wrong answer is plausible: a date + amount
  match without a description signal can marry unrelated rows. The 5-day window and
  occurrence ordinal from `transfers.ts` / `matchExisting.ts` are the existing guards; reuse
  them rather than inventing a looser rule.

---

While this spec is **active**, when we make a material change to requirements, design, or
scope, update the relevant sections and append to **Changes from original plan**. Skip pure
implementation details. Freeze when verified.
