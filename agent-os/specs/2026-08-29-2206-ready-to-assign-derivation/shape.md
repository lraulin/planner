# Ready to Assign derivation — Shaping Notes

**Status: active**

## Scope

Rework the `BudgetSummary` card on the Budget page so that:

1. The seven-term breakdown reads as the calculation it is, behind a `How this adds up`
   disclosure, typeset as an aligned column with a rule and a restated total.
2. The uncategorized backlog gets one prominent, warning-toned, clickable home inside the card,
   replacing the unnoticed `Backlog` strip.
3. Each income category's amount links to its filtered register.
4. The uncategorized term and the backlog tray stop disagreeing about which rows they count.

### Out of scope

- Linking the other Ready to Assign terms. Reconciliation is a residual with no rows by
  construction; Assigned, Held, Overspent and Funds from last month are budget-table facts.
  `budget-activity-register-links` D1 already excluded RTA terms and that exclusion stands.
- Any new URL filter dimension. `viewState.ts:18` — _"Filters, sort and column layout stay out
  of the URL — those live on `user_settings`"_ — so a new preset would mean a new
  `RegisterViewId` plus a `viewRows` branch, a `registerQueryKey` entry and a strip-out rule.
  Nothing here needs one.
- Showing the uncategorized warning on the Register or the Dashboard. Considered and not taken
  this round; the Budget card is where the number it explains lives.
- General bank reconciliation workflow, still out per `single-pool` D2.

## Decisions

See `plan.md` D1–D7. The two worth recording as _reversals during shaping_:

- **An earlier draft merged terms to remove redundancy.** `Funds from last month + Income this
month → Available funds` (Actual's `incomeAvailable`) and
  `Uncategorized activity + Account reconciliation → Unaccounted for`. Rejected once the
  section's purpose was named: a derivation restates its inputs, so the overlap with
  `IncomeSection`'s "Received" is correct behaviour, not duplication. The merges would have
  reduced legibility and disturbed `single-pool` D3 for no gain.
- **An earlier draft made the uncategorized _term_ a link.** Superseded by giving the amber line
  the link instead — it carries the count, which is the figure that survives a sum cancelling to
  zero, and it is the only element that needs to be clickable.

## The design

**Thesis:** the card holds one number and one decision; the arithmetic behind the number moves
one click away and is typeset as an actual equation.

**Diagnosis it answers:** the card gives seven numbers identical visual weight in a wrapped chip
row — a $100,470.76 assignment and a $7.41 filing residue render at the same size, weight and
colour. That flatness is also why the strip below went unseen: the whole region reads as one
uniform grey field. The card was organised by arithmetic while the reader's question is _"is
anything wrong, and what do I do about it?"_

**Palette.** `--goal-unmet` #b45309 for the amber line, chosen from the token's own documented
meaning rather than invented (see D7). No new tokens. Everything else stays `text-ink` /
`text-ink-muted` / `text-ink-faint`.

**Type.** Unchanged — Archivo for labels, IBM Plex Mono via `.tabular` for money. The derivation
column depends on the tabular figures already in the system; that alignment is what makes it
read as arithmetic rather than as prose.

**Restraint.** The amber line is the only saturated element in an otherwise grey card. No
animation: the disclosure uses the browser's own, and a transition on a money figure would be
decoration in an app whose stated metaphor (`globals.css:4`) is an instrument.

**Copy.** `How this adds up` names the purpose in the reader's words, not "Breakdown" or
"Details". `Categorize` keeps the verb the existing button uses. The count leads the amber line
and the amount follows as context. `since August` stays — the backlog spans the whole budget,
not the month on screen.

## Context

- **Visuals:** `visuals/approved-wireframe.md` — before/after wireframe of the card.
- **References:** see `references.md`.
- **Product alignment:** roadmap Phase 3 → Financial planning. This does not complete a listed
  item; it refines the Budget summary shipped by `single-pool-budget` and `budget-fix-this`.

## Standards Applied

See `standards.md`.
