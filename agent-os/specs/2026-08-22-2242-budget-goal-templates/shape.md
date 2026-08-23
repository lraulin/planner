# Budget goal templates — Shaping Notes

**Status: frozen / complete**

## Scope

Reimplement Actual Budget's goal templates on `/finances/budget`, so the envelope budget can
fill itself from a structured template list instead of being typed by hand.

In scope:

- Four template types: **simple**, **schedule**, **by**, **remainder**.
- JSONB `templates` on `finance_budget_categories`; `goalCents` on allocations.
- Structured drawer editor (no PEG parser, no `#template` notes language).
- Apply / Overwrite as explicit clicks; Overwrite this envelope on the row menu.
- **Add from schedules…** stacking active schedules onto a chosen envelope (default Bills).
- Goal-met / not-met indicator on Assigned.

### Out of scope

- PEG / `#template` in notes.
- percentage, periodic, average, copy, spend, refill-as-own-type, `#goal` directive,
  cleanup templates, daily/weekly limits, schedule adjustments.
- Priority UI (the field is stored, default 0).
- Auto-apply on month open or any background job.
- Creating / reordering envelopes, editing `sourceCategories`, showing the movement log.
- Calendar badge on a due envelope.
- Merging with Commitments or Available to Spend.
- Rules / payees / reports.

## Decisions

- **D1** — Four types, Actual's semantics, integer cents, structured UI. Notes stay free
  text. This supersedes the schema comment that templates would live in `notes`.
- **D2** — Apply / Overwrite are clicks, same posture as schedules' Post now. Demand
  templates may drive Ready to Assign negative; remainder only consumes leftover RTA > 0.
- **D3** — Add from schedules… is the join. One schedule must not fund two envelopes.
  The action writes templates and does not Apply.
- **D4** — Pure apply engine with named traps. Schedule math rewritten over `YYYY-MM-DD`
  keys on top of `recur.ts`. `fromLastMonth` is carry-in; negative without carryover is 0.
- **D5** — MIT attribution on every module that reproduces Actual's template math.

Confirmed during shaping:

- Slice is goal templates, not budget UX completeness and not Rules.
- Types this slice: simple + schedule + remainder + by. Structured UI, no notes syntax.
- Product alignment as written: parallel with Available to Spend / Commitments; remainder
  last; priorities stored not shown.
- Visuals: none. Actual's Budget + goal-templates docs are the reference.
- Standards: copy full text, including `drawer-pattern`.

## Context

- **Visuals:** None.
- **References:** `../actual` (MIT) — `goal-template.ts`, `category-template-context.ts`,
  `schedule-template.ts`, `types/models/templates.ts`, `docs/docs/experimental/goal-templates.md`.
  In this repo: `src/lib/finances/budget/`, `src/lib/finances/schedules/`,
  `src/components/finances/budget/BudgetView.tsx`.
- **Product alignment:** Roadmap § Financial planning **Next:** Goal templates. Continues
  absorbing Actual in parallel. Autopilot is one click, not unattended.

## As built

Everything above shipped. Four notes on where the build went past the shape:

- The editor's line state lives in `templates/draft.ts`, not in the component — a money field
  is empty mid-typing and `Template` has no shape for that, so the conversion (and its
  validation messages) is tested logic like the rest of the engine.
- The drawer's this-month figure is the apply engine run over that one envelope with `force`:
  literally the call **Overwrite this envelope** makes, so the preview cannot drift from it.
- The Budget grid now also passes `rowMenu` to `DataGrid`. The row menu had been reachable
  only from the Balance cell, which the phone's compact row does not draw — **Edit templates…**
  would otherwise have been a desktop-only affordance.
- Short of goal is a new `--goal-unmet` amber, not `--chart-spend`. Red already means
  overspent here, and an underfunded envelope has not spent anything.

## Standards Applied

- `development/clean-code` — math in lib, thin actions, userId first
- `development/testing` — pure tests beside the math; integration + second user
- `development/security` — every mutation proves ownership
- `development/dates` — month keys, schedule next-date, never startOfDay
- `development/commits` — one logical change, Spec trailer
- `database/migrations` — JSONB + goalCents, drizzle-generated
- `components/data-grid` — Budget grid, row menu, month actions
- `components/drawer-pattern` — envelope template editor
- `components/ux-principles` — drawer for templates; Add from schedules is capture/confirm
- `components/navigation` — Apply/Overwrite/Add from schedules as menu commands
- `components/responsive` — phone
