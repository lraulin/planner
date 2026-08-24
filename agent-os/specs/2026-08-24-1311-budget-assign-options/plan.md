# Budget assign options (YNAB-shaped)

**Status: frozen / complete** (2026-08-24)
Spec folder: `agent-os/specs/2026-08-24-1311-budget-assign-options/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — envelope math (D1); every affordance is an allocation edit (D7); assigning more than Ready to Assign is a lie about where the money is (`operations.ts` clamps).
- **Extends:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` — templates (`simple` / `by` / `remainder`) and `goalCents` as the envelope's ask; **Edit templates…** stays. Demand math in `templates/apply.ts` / `schedule.ts` is reused, not rewritten.
- **Extends:** `agent-os/specs/2026-08-23-2313-one-budget/` — a bill envelope's funding demand is intrinsic (cadence, not a `schedule` template line).
- **Extends:** `agent-os/specs/2026-08-24-0930-envelope-sections/` — Savings assigns like any envelope and participates in Ready to Assign; Income never does.
- **Supersedes:** `agent-os/specs/2026-08-22-2242-budget-goal-templates/` **D2** — Apply / Overwrite as the fill gesture, and "Apply may drive Ready to Assign negative." The shortfall is now a preview (partially funded / not funded), not a negative headline.
- **Supersedes:** `agent-os/specs/2026-08-23-2313-one-budget/` **D4** only the "Apply/Overwrite stay the fill click" part. The click stays explicit; the command is Assign.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` the unclamped month-bar fills **Copy last month**, **Set to 3-month average**, and **Set all to zero**. They become assign options that cannot consume more than Ready to Assign.

## Context

The unified Budget page still offers **Apply templates** / **Overwrite with templates**. Those names never described what they did, and after one-budget they barely work: bill envelopes no longer hold template JSON (`D4` made cadence the demand), while the month bar and row menu still gate on `templates.length > 0`. Recurring-spend envelopes kept a `simple` line; bills did not. Apply-empty-Assigned vs Overwrite-everything is Actual's split, not the daily job.

The daily job is YNAB's: **give every dollar a job** by moving money from Ready to Assign into envelopes until the headline is $0.00. Auto-assign is a ranked, clamped distribution with a preview. Templates (and bill cadence) stay as the _ask_; Assign is how money moves.

This restores the original envelope-budget rule (`operations.ts`: you cannot assign more than Ready to Assign offers) which goal-templates D2 deliberately bent so the shortfall would show as a negative headline.

## Decisions

**D1 — Eight auto-assign options, YNAB's names.** From the Ready to Assign **Assign** control (Auto tab) and from an envelope's right-click **Assign** submenu:

| Option                      | What it does                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Underfunded**             | Funds the remaining ask, in priority order, until money runs out or everything is fully funded.                                                                                                                               |
| **Assigned Last Month**     | Sets Assigned to last month's Assigned.                                                                                                                                                                                       |
| **Spent Last Month**        | Sets Assigned to last month's spend (`max(0, −activity)`).                                                                                                                                                                    |
| **Average Assigned**        | Sets Assigned to the mean Assigned over up to the last 12 months, excluding the current month. Window starts at the envelope's first month with a non-zero Assigned so a new envelope is not averaged against leading zeroes. |
| **Average Spent**           | Same window over spend (`max(0, round(−spent / n))`). Replaces today's unclamped 3-month average.                                                                                                                             |
| **Reduce Overfunding**      | For envelopes that have an ask, moves Assigned above that ask back to Ready to Assign. Envelopes with no ask (no bill cadence, no demand template) are left alone — a savings pile is not "overfunded."                       |
| **Reset Available Amounts** | Sets Assigned so Available (balance) is $0. May write a negative Assigned. Soft plan reset.                                                                                                                                   |
| **Reset Assigned Amounts**  | Sets Assigned to $0.                                                                                                                                                                                                          |

**D2 — You cannot assign more than you have.** Any option that _consumes_ Ready to Assign is clamped to `max(0, RTA)`. One envelope may be partially funded; every later envelope in that run is left unchanged (not zeroed). Options that _return_ money (Reduce Overfunding, Reset Available, Reset Assigned, and the reduction half of a SET option) always apply in full, first, so freed money can fund later increases. Remainder still only consumes leftover RTA `> 0`.

This supersedes goal-templates D2. A negative Ready to Assign from an old Apply is not created by this feature; existing negatives are still the fold telling the truth about a past over-assignment.

**D3 — Underfunded's ask is what we already compute.** No new "target" type. For each envelope:

```
neededAssigned = max(demandFromTemplatesAndBill, assignedToZeroBalance)
gap            = max(0, neededAssigned − currentAssigned)
```

- `demandFromTemplatesAndBill` is today's template engine: `simple` + `by` + `billFundingDemand` (a `kind: "bill"` envelope participates with an empty `templates` array). Remainder is not part of the ask.
- `assignedToZeroBalance` covers overspend: the Assigned that would make `balance >= 0`.
- Income is never a participant. Paused and cancelled bills are skipped. Hidden envelopes are skipped on an "all" run and included only when selected.

**D4 — Underfunded priority** (YNAB's order, mapped onto this app; no credit-card payment category exists here):

1. Overspent envelopes (`balance < 0`): cover the overspend _and_ fully fund that envelope's ask. Tie-break: bill next-due, then current on-screen order.
2. Bill envelopes with a next-due, ordered by due date (pay-this-month and sinking both live here).
3. `by` templates, ordered by the current target month.
4. Simple monthly templates ("end of month").
5. Remainder last, leftover RTA only.

An envelope appears in the earliest bucket it qualifies for, not twice. The stored template `priority` field stays unused.

**D5 — SET options reduce first, then increase in that same priority.** Assigned Last Month / Spent Last Month / Average Assigned / Average Spent compute a desired Assigned per envelope. Desired `<` current returns money immediately. Desired `>` current consumes RTA in Underfunded order; the last increase may be partial.

**D6 — Always a preview, then Assign Money / Cancel.** Clicking an Auto option opens a confirm modal (ModalShell). The Auto/Manual list is the same dialog, not a stacked popover — on the phone that is one bottom sheet. It lists proposed `+/−` per envelope, grouped:

- Yellow: not enough money — "N categor(y/ies) will be partially funded" and/or "M categor(y/ies) will not be funded."
- Green: "K categories will be fully funded" (or the equivalent for a return-money option).

`$0` deltas are omitted. Cancel writes nothing. Assign Money writes the previewed allocations — the preview _is_ the engine, not a second estimate (same trap TemplateDrawer already solved).

**D7 — Scope.**

- **Banner Assign, empty selection → every eligible spending + savings envelope** (Bills, Regular spending, Savings).
- **Banner Assign, a real selection in the focused table → those envelopes** (a group header expands to its envelopes in that section). A lone focus highlight is _not_ a selection: budget tables start empty, click selects, Shift/⌘ extend, Escape / click blank clears. That is a recorded exception to `applySelect`'s "never empty" Outline rule.
- **Right-click Assign → that one envelope**, even if other rows are selected.
- Selection is per table. Only the focused table's selection narrows a banner run; an empty focused table means "all sections."

**D8 — Manual stays, in the same popover.** Auto | Manually tabs, matching the screenshots. Manual is today's Assign remaining, with an amount field defaulting to current RTA and a To picker grouped by section (Income omitted). It does not open the auto-assign preview. Inline Assigned-cell edit is unchanged and still uses `setAssignment` (not clamped to RTA — that is a hand edit, as today).

**D9 — `goalCents` is the unclamped ask.** Underfunded writes `goalCents = neededAssigned` even when Assigned is only a partial. That is how the Assigned cell stays amber after a short run. The other seven options do not write `goalCents`. Edit templates… still does not assign.

**D10 — The fill chrome is the Assign control.** Remove from the month bar and command registry: Apply templates, Overwrite with templates, Copy last month, Set to 3-month average, Set all to zero, Overwrite this envelope. Hold for next month stays. **Assign remaining…** on the summary becomes the Assign button (visible even when RTA is $0, because Reduce/Reset still have work). Each Auto option is a command under Tools ▸ Assign; a command without a menu is not shipped. Phone ⋯ is the same registry.

**D11 — Divergence from Actual is named.** We keep Actual's envelope fold and template _math_. We take YNAB's assign _gesture_ (clamp, preview, eight options, selection scope). Record it in `docs/actual-budget/README.md` under "Where we diverge." MIT headers stay on modules that still reproduce Actual arithmetic.

### Out of scope

- A new target/goal type, YNAB-style, separate from templates.
- Credit-card payment underfunded (we have no YNAB CC payment categories).
- Auto-assign on month open or any background job.
- Changing template types, the templates editor's demand preview (it stays the unclamped ask; only its "run Apply templates" copy changes).
- Replacing Hold for next month.
- Making the inline Assigned edit clamp to RTA.

## Acceptance criteria

- [x] Apply templates, Overwrite with templates, Copy last month, Set to 3-month average, Set all to zero, and Overwrite this envelope are gone from the month bar, Tools menu, command palette, and row menu.
- [x] Ready to Assign has an **Assign** control with Auto (eight options, each showing the unclamped total it would move) and Manually (amount + To).
- [x] Choosing an Auto option always opens a preview. Cancel writes nothing. Assign Money writes exactly the previewed deltas (disabled when every delta is $0).
- [x] With nothing selected, Underfunded considers every eligible spending + savings envelope. With a multi-selection or group header in the focused table, only those. Right-click Assign considers that one envelope.
- [x] Underfunded never drives Ready to Assign negative. When RTA is short, the preview names the partial envelope and the unfunded remainder; those unfunded envelopes keep their previous Assigned.
- [x] Underfunded covers overspend first, then bills by due date, then `by` targets, then simple monthly, then remainder.
- [x] A bill with empty `templates` is underfunded from its cadence. A paused/cancelled bill is not. Income is not.
- [x] Assigned Last Month / Spent Last Month / both Averages SET Assigned, reduce-first, then clamp increases. Averages use up to 12 prior months, first-activity start, no leading zeroes.
- [x] Reduce Overfunding returns only demand-envelope excess. Reset Available zeroes Available (Assigned may go negative). Reset Assigned zeroes Assigned.
- [x] After a partial Underfunded run, `goalCents` is still the full ask, so the Assigned cell reads unmet.
- [x] A second user cannot preview or apply assign onto the first user's month — `*.integration.test.ts`.
- [x] `npm run lint`, `npm run typecheck`, `npm run test:unit` (Postgres up — no skip warning), and `npm run smoke` on a running dev server all pass. Driven in the browser on the real file: Assign → Underfunded with negative RTA (preview names 7 unfunded, Assign Money disabled), Manual tab, right-click Rent → Assign ▸ eight options, phone sheet. `next build` skipped while the dev server is up.

## Changes from original plan

Material refinements during implementation (requirements, design, scope). Omit pure code polish.

| #   | Change                                                                                                                    | Why                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Auto list and preview share one ModalShell (bottom sheet on phone) rather than a popover plus a stacked confirm.          | ModalShell has no stacking, and the phone already treats this dialog as a sheet.                    |
| 2   | Skipped envelopes appear in the preview but produce no allocation write; Assign Money is disabled when every delta is $0. | Writing `goalCents` on envelopes that received nothing would mutate the month without moving money. |
| 3   | Budget grids pass `{ allowEmpty: true }` to `useMultiSelect`.                                                             | Outline's prune fills an empty selection with the first row; here empty means "assign all."         |

## Task 1: Save Spec Documentation

Create `agent-os/specs/2026-08-24-1311-budget-assign-options/` with:

- **plan.md** — this plan (**Status: active**), including empty **Changes from original plan**
- **shape.md** — scope, D1–D11, visuals, product alignment, out of scope
- **standards.md** — full text of: `development/clean-code`, `testing`, `security`, `dates`, `commits`; `components/ux-principles`, `navigation`, `data-grid`, `modal-pattern`, `responsive`
- **references.md** — governing specs (Extends / Supersedes as above), YNAB assign notes, in-repo `templates/apply.ts`, `operations.ts`, `BudgetView` / `BudgetSummary` / `AssignRemainingDialog`, `useMultiSelect`
- **visuals/** — the four YNAB screenshots from shaping (Assign Auto list, Manual tab, category picker, Underfunded preview)

## Task 2: Pure assign engine

New `src/lib/finances/budget/assign/` — no DB, no React, integer cents.

- Reuse `demandOf` / `billFundingDemand` / `runSimple` / `runBy` / `distributeRemainder` as the ask. Do not port a second copy of template math.
- One function: given month fold, envelopes, option, optional `categoryIds`, `readyToAssignCents` → `{ lines, allocations, goalCentsWrites, note, remainingRtaCents }`. The preview UI renders `lines`; the mutation writes `allocations`. Same call.
- Named tests for the traps in D2–D5 and D9 (partial last envelope, unfunded left untouched, overspend-before-due-date, bill-with-empty-templates, remainder never goes negative, SET reduce-first, 12-month first-activity average, Reduce Overfunding ignores no-ask envelopes, Reset Available may write negative Assigned, income/paused skipped, `goalCents` = full ask on a partial Underfunded).

## Task 3: Mutations and actions

Thin `assignBudget(userId, { month, option, categoryIds? })` in `src/lib/finances/budget/mutations.ts`: load, run the engine, upsert allocations, append the month note, write `goalCents` only for Underfunded. Same ownership proof as `applyBudgetTemplates`.

`previewBudgetAssign` returns the engine result without writing — or the page runs the engine on already-loaded budget data (preferred: the page already has the fold). If the client can compute the preview from `BudgetData`, do that and keep the mutation as the write; do not have two serverside paths that can disagree.

Replace `applyBudgetTemplatesAction` usage. Keep `applyTemplates` as the demand helper the editor and Underfunded both call.

Extend `mutations.integration.test.ts`: second user fails to assign or reset the first user's month. A short-RTA Underfunded on a fixture writes the partial and leaves the rest.

Manual assign keeps `assignFromReadyToAssign` (already clamped).

## Task 4: Assign popover, preview, retire old fills

- `BudgetSummary`: Assign button (not only when RTA `> 0`). Popover: Auto | Manually. Auto rows show option label + unclamped total. Manual replaces `AssignRemainingDialog`.
- Preview modal: D6 copy and grouping; Cancel / Assign Money.
- Month bar: drop Apply / Overwrite / Copy last month / 3-month average / Set all to zero. Keep month nav, Show hidden, Hold for next month.
- Commands: delete `budget.templates.apply` / `overwrite`; add Tools ▸ Assign ▸ the eight options. Unavailable is disabled with the reason (nothing eligible, RTA empty for a consume-only option, etc.).
- Copy: Bills caption, TemplateDrawer "run Apply templates", row-menu labels.

## Task 5: Budget-grid multi-select and row-menu Assign

Wire `useMultiSelect` on the three budget tables. Empty selection allowed (D7). Pass `selectedIds` into `DataGrid`. Banner scope reads the focused table.

Row menu: **Assign** submenu with the eight options, each opening the same preview scoped to that row. Disabled with a reason on income. Remove **Overwrite this envelope**.

Right-click / long-press already open `rowMenu`; the submenu must work on the phone sheet (`responsive`).

## Task 6: Verify, freeze spec, update roadmap

- `npm run lint`, `npm run typecheck`, `npm run test:unit` — check for the Postgres-skip warning.
- `next build`; start the dev server; `npm run smoke`.
- Browser, real file: Assign → Underfunded with too little RTA (preview names partial + unfunded) → Assign Money → headline not negative; right-click one bill → Assigned Last Month; Manual tab to one envelope; Reduce Overfunding; confirm templates editor still saves an ask and Underfunded then funds it; phone viewport Assign + row-menu Assign.
- Update `plan.md` / `shape.md` for as-built drift; complete **Changes from original plan**; mark **Status: frozen / complete**; update `agent-os/product/roadmap.md` § Financial planning (Apply/Overwrite retired; YNAB-shaped Assign shipped). Add the D11 divergence row to `docs/actual-budget/README.md`.

---

> While this spec is **active**, when we make a material change to requirements, design, or scope (including from feedback on what was implemented), update the relevant sections and append to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
