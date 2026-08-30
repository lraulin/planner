# Ready to Assign — make the derivation read as a derivation

**Status: active**
Spec folder: `agent-os/specs/2026-08-29-2206-ready-to-assign-derivation/`

## Spec relationships

- **Extends:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` — the fold, and the rule that
  `terms` is built beside the arithmetic so a page cannot render a breakdown that fails to sum.
- **Extends:** `agent-os/specs/2026-08-24-2206-single-pool-budget/` — D3's two named signed
  discrepancy terms and the pool identity, both preserved here.
- **Extends:** `agent-os/specs/2026-08-25-1154-month-ahead-zero-based/` — D3's
  `Assigned in future months` term and the revised footnote identity.
- **Extends:** `agent-os/specs/2026-08-29-2033-budget-fix-this/` — D2 keeps the verb on the
  number; the headline row is unchanged.
- **Extends:** `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` — the
  `?view=uncategorized` deep link and its eligibility semantics.
- **Extends:** `agent-os/specs/2026-08-28-1356-budget-activity-register-links/` — D4/D5's URL
  contract for register deep links, reused verbatim for income categories.
- **Supersedes:** `agent-os/specs/2026-08-28-1356-budget-activity-register-links/` **D1**, only
  its "not Income received" exclusion — each income category's Activity amount now links.
  Ready to Assign terms themselves remain unlinked, as D1 required.
- **Supersedes:** `agent-os/specs/2026-08-22-1948-zero-based-budget/` **D6** and
  `agent-os/specs/2026-08-23-2023-actual-categories-and-tags/` Task 4, only as to _where_ the
  uncategorized tray lives — it moves into the summary card and gains warning tone. The link
  target and the eligible row set are unchanged.
- **Supersedes:** `agent-os/specs/2026-08-24-2206-single-pool-budget/` **D4**, only as to the
  placement of the pool teaching sentence — it moves behind the disclosure. The pool figure
  stays visible and the copy itself is unchanged.

## Context

`BudgetSummary` shows Ready to Assign over seven terms — Funds from last month, Income this
month, Overspent last month, Assigned, Held for next month, and (current month only)
Uncategorized activity and Account reconciliation — plus the account-pool footnote.

The work started as "should these numbers link into a filtered register?" and landed somewhere
better. The section's job is to show **how Ready to Assign is calculated**, and its design never
says so. That reframing matters: the fact that "Income this month" restates `IncomeSection`'s
"Received" is _not_ a defect, because a derivation is supposed to restate its inputs. The defect
is that seven equal-weight chips in a wrapped row — no operators, no alignment, no total — read
as a list of facts rather than as arithmetic.

Two supporting findings from shaping:

- **The uncategorized warning already existed and had never been noticed.** `Backlog`
  (`BudgetView.tsx:2136`) renders whenever `uncategorizedCount > 0`, is already count-gated,
  already links to `/finances/register?view=uncategorized`, already carries a Categorize button
  — but is styled `border-rule bg-surface-raised`, identical to ordinary chrome.
- **Uncategorized is the only term with an actionable row set.** Account reconciliation is a
  residual plug (`envelope.ts:425`) with no rows by construction; Assigned, Held, Overspent and
  Funds from last month are budget-table facts, not transaction sets. Income has rows, but only
  per category — which is where its links go.

## Decisions

- **D1 — The seven terms stay, unmerged.** Nothing is compressed away to remove redundancy;
  repetition with the Income section is the nature of a derivation. Earlier drafts merged
  `Funds from last month + Income this month` into `Available funds` and
  `Uncategorized activity + Account reconciliation` into `Unaccounted for`. Both were rejected:
  they solved a redundancy problem that does not exist, at the cost of the derivation's
  legibility and of `single-pool` D3's separately-named discrepancies.
- **D2 — The derivation moves behind a `<details>` disclosure**, labelled `How this adds up`,
  and is typeset as an equation: labels left, `.tabular` amounts right-aligned in one column, a
  rule, and the total restated as `Ready to Assign`. Alignment plus a total is the entire fix.
  Native `<details>` (the idiom at `FilterSelect.tsx:33`) rather than a hover tooltip — it must
  work on the iPhone, it holds numbers worth selecting, and it stays keyboard-reachable.
- **D3 — The uncategorized indicator is a warning-toned, clickable count inside the card**, and
  the separate `Backlog` strip is deleted. One surface, beside the number it explains.
- **D4 — Each income category's Activity amount links** to its filtered register, reusing
  `ActivityAmountLink` and `activityRegisterHref` unchanged.
- **D5 — The term/tray date-bound drift is fixed here**, not deferred. See below.
- **D6 — The account-pool figure stays visible on the card**; only the explanatory sentence moves
  into the disclosure, beside the arithmetic it explains.
- **D7 — Colour comes from `--goal-unmet`**, whose own comment in `globals.css:74-77` reads
  _"Amber says 'not finished' without saying 'you did something wrong'."_ That is exactly an
  unfiled transaction. `--chart-spend` would say overspend and `--priority-a` would say
  priority-A/destructive; one hue, one job. The callout idiom already exists at
  `AssignDialog.tsx:200`.

## The bound fix (D5)

`uncategorizedActivityThrough` (`budget/queries.ts:374`) bounds at `monthEndKey(currentMonth)`.
`backlogSince` (`:319`) and the register's `categoryEligibleIds`
(`categoryEligibility.ts:95-108`) do not bound forward. A future-dated uncategorized row
therefore sits in the tray and in the working pool — `workingBalance.ts:61` applies no date
bound to pending — but not in the term, landing in reconciliation instead. That is what
`single-pool` change-log row 2 explicitly ruled out:

> Categorizing a backlog row should move it out of the named uncategorized term, matching the
> tray, rather than hiding it in reconciliation.

The observed figures (`-$7.41` uncategorized against `-$122.09` reconciliation) fit that shape,
so **measure before changing**, then drop the upper bound so the term matches the tray.

Because reconciliation is a residual, `readyToAssignCents` cannot move — only the attribution
between the two terms, which is the point. Both terms are visible in the derivation, so the
correction is legible on screen, and `uncategorizedActivityCents` is what the audit trail
records (`audit/checkpoints.ts:67`).

## Acceptance criteria

- [ ] The collapsed summary card is materially shorter than today's: headline, note, action
      button, pool figure, and the amber line when it applies.
- [ ] `How this adds up` expands to a right-aligned column whose terms visibly sum to the
      restated `Ready to Assign` total, including `Assigned in future months` when non-zero.
- [ ] The seven terms still come from `month.terms`; the component cannot render a breakdown
      that fails to sum to its own headline.
- [ ] The amber line appears whenever `uncategorizedCount > 0`, **including when the amount
      cancels to $0.00**, and is absent at zero count.
- [ ] Categorize lands on `?view=uncategorized` showing exactly the number of rows the line
      claims.
- [ ] The `Backlog` strip and its call site are gone.
- [ ] Each income category amount opens the register filtered to that envelope and month.
- [ ] `uncategorizedActivityThrough` and `backlogSince` return figures for the same row set;
      `assertPoolIdentity` and `envelope.test.ts:517` still hold.
- [ ] The pool sentence is unchanged in wording and present inside the disclosure.

## Changes from original plan

| #   | Change                      | Why |
| --- | --------------------------- | --- |
|     | _(filled during implement)_ |     |

## Task 1: Save spec documentation

Create this folder with `plan.md`, `shape.md`, `standards.md`, `references.md`, and
`visuals/approved-wireframe.md`. **Done** — this file.

## Task 2: Measure the drift

Query on-budget, leaf, non-superseded, uncategorized rows dated after the current month end.
Record the count and sum in **Changes from original plan**; it decides how much of the
`-$122.09` reconciliation is genuine drift versus misattributed backlog.

## Task 3: Bound fix

Drop the upper bound in `uncategorizedActivityThrough` so its predicate matches `backlogSince`.
Re-verify `assertPoolIdentity` (`membership.ts:80-92`) and `envelope.test.ts:517`. Add a test
that a future-dated uncategorized row lands in the term rather than in reconciliation.

## Task 4: The disclosure

Restructure `BudgetSummary`: headline row, amber line, pool figure, then a `<details>`
containing the aligned term column, the rule, the restated total, and the pool sentence. Terms
still map `month.terms`.

## Task 5: Amber line

Gate on `uncategorizedCount > 0` using the `AssignDialog.tsx:200` idiom (`role="status"`,
`border-[var(--goal-unmet)] bg-[var(--goal-unmet)]/10`). Thread count and cents into
`BudgetSummary`. Delete `Backlog` and its call site (`BudgetView.tsx:1584`).

## Task 6: Income links

Swap `IncomeSection`'s amount `<span>` (`BudgetView.tsx:2325`) for `ActivityAmountLink`.

## Task 7: Verify, freeze spec, update roadmap

- `npm run test:unit` — sum-to-headline, pool identity, `export.test.ts` captions.
- `npm run test:integration` with Postgres up — the bound change is DB-side.
- `npm run lint && npm run typecheck`.
- **`npm run smoke`** with the dev server running — required after touching `src/app/**`.
- Browser check of every acceptance criterion above.
- Push to `master` and check on the iPhone: the card is in a sticky header, so the amber line
  and the open disclosure must wrap without pushing the tables off screen.
- Mark `plan.md` / `shape.md` **frozen / complete**, complete **Changes from original plan**,
  and update the Phase 3 financial-planning section of `agent-os/product/roadmap.md`.

---

**Standing rule while active:** keep this file and `shape.md` current with material changes to
requirements, design or scope — including feedback on what was actually built — and append a row
to **Changes from original plan**. Skip pure implementation details. Freeze when verified.
