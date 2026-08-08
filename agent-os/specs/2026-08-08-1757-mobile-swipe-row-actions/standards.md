# Standards for Mobile swipe row actions

The following standards apply to this work.

---

## components/responsive

**Why:** This standard owns the gesture table, the axis-lock rule, the tap-target minimum
and the phone verification checklist. It is also the one this work amends: its swipe bullet
says "reversible actions only … never delete without a confirmation", two clauses that pull
against each other once a direction is Delete.

See `agent-os/standards/components/responsive.md`.

Key constraints for this feature:

- **One breakpoint.** `md` / 48rem. Branch in JS with `useIsCompact()`, never
  `window.innerWidth`, never a user-agent string. `DataGrid` already does this.
- **A swipe must not fight the scroll.** Lock horizontal only after the pointer has moved
  further horizontally than vertically past a threshold; an exact diagonal goes to the
  list. Already true in `swipeAxis` and must stay true.
- **Thresholds are pure logic in `src/lib/touch/` with tests** — an off-by-one in a slop
  threshold is invisible until it is infuriating.
- **Nothing is reachable only by a gesture.** Complete and Delete both keep their
  long-press menu rows; the swipe is a shortcut to commands that already exist.
- **44 × 44 px minimum** on anything tappable below `md`; use `--tap-target`.
- The verification checklist at 390 × 844, then a re-check at 1280 × 800, is the gate.

---

## components/ux-principles

**Why:** Reserves modals for exactly two cases — destructive confirmations and critical
blocking decisions. The swipe-delete confirm is the first of those, which is what makes a
dialog the right answer rather than a cost to engineer around.

See `agent-os/standards/components/ux-principles.md`.

Key constraints for this feature:

- The confirmation is the existing `ConfirmDialog` with the existing `nodeDeleteMessage`
  branch warning — not a second, shorter sentence written for the gesture.
- Cancel takes focus, so a reflexive Return does the safe thing.

---

## development/testing

**Why:** There are no React component tests and none are wanted, so the swipe's correctness
has to live in pure functions with tests beside them, and the rest is a hands-on checklist.

See `agent-os/standards/development/testing.md`.

Key constraints for this feature:

- `swipeOffset`, `swipeProgress`, `swipeAxis`, `swipeAction` stay pure and tested in
  `src/lib/touch/swipe.test.ts`. Resistance is exactly the kind of formula where a wrong
  answer looks plausible.
- **No React component tests** for `CompactRow` — the type-aware ESLint rules cover that
  bug class.
- No database work here, so no integration tests and no cross-user case.
- A green gate is not proof the app runs: `npm run smoke` after touching `src/app/**`, and
  the gesture gets driven by hand on a phone viewport before this is called done.
