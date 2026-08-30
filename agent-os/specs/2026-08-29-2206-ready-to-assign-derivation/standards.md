# Standards for Ready to Assign derivation

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`.
References, not copies — see AGENTS.md. Recover exactly what applied with
`git show 2920aa7:agent-os/standards/<path>`.

- `agent-os/standards/components/ux-principles.md` — the card is inline chrome, not a modal; the
  disclosure is a progressive-disclosure affordance on a dense page. Governs the choice of a
  click-opened `<details>` over a hover tooltip.
- `agent-os/standards/components/responsive.md` — the card sits in a sticky header. Both the
  amber line and the open disclosure must wrap at the phone width without pushing the grids off
  screen, and the Categorize control needs a 44px tap target (`min-h-tap`).
- `agent-os/standards/components/navigation.md` — the register deep links are the existing
  `?view=` contract; no new command or menu entry is introduced.
- `agent-os/standards/development/clean-code.md` — `month.terms` stays owned by the fold in
  `src/lib/finances/budget/envelope.ts`; the component renders, it does not compute. The bound
  fix changes one query rather than adding a second definition of "uncategorized".
- `agent-os/standards/development/testing.md` — the fold and the bound fix are pure/DB logic and
  get unit and integration tests respectively. No React component tests. The cancelling-to-zero
  case is the test that would fail on the plausible mistake of gating the amber line on the
  amount.
- `agent-os/standards/development/dates.md` — the bound fix is entirely about calendar-day
  comparison (`monthEndKey`, `transaction_date`); no `startOfDay` on calendar fields.
- `agent-os/standards/development/commits.md` — one logical change per commit; the bound fix and
  the card rework are separate commits with the root cause stated in the body.

## Deviations

**One.** `agent-os/standards/components/ux-principles.md` treats icon-only controls as needing a
title tooltip; the amber line's `⚠` is decorative and is accompanied by text, so it carries no
tooltip and is `aria-hidden`. The line itself is `role="status"`, matching `AssignDialog.tsx:200`.

No deviation from the fold-owns-the-terms rule: this spec explicitly preserves it, and the
rejected merge drafts are recorded in `shape.md` precisely because they would have weakened it.
