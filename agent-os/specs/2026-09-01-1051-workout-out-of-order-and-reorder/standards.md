# Standards for Lift in any order; reorder the exercises

**Status: frozen / complete** (2026-09-01)

Standards pinned at `91999a0ab88ec727956924e702f589a4a5833395` — recover any of the files below with
`git show 91999a0ab88ec727956924e702f589a4a5833395:agent-os/standards/<path>`. References, not copies — see AGENTS.md.

- `agent-os/standards/development/clean-code.md` — active-exercise resolution and `moveItem` are
  pure logic and belong in `src/lib/fitness/**`, not in `SessionEditor`. `moveItem` goes in
  `groupEdit.ts`, which already owns the contiguity invariant, rather than becoming a second
  module that knows about groups. Also the model rule: the bug is a missing concept (the active
  exercise), not a missing guard.
- `agent-os/standards/development/testing.md` — `currentSet.ts` and `groupEdit.ts` get adjacent
  unit tests that would fail on a plausible mistake (fallback not taken, a group left
  non-contiguous). No React component tests for the drawer. The reorder path touches the database
  through the existing replace-rebuild, so the assertion goes in
  `mutations.integration.test.ts` with a second user who fails; check the DB tests did not skip.
- `agent-os/standards/components/responsive.md` — the gym is one-handed on a phone. Reorder
  buttons are 44px (`--tap-target`) and spaced so the pair does not mis-tap; drag-to-reorder is
  disabled below `md`, and any ranking drag would provide must exist as an explicit control
  anyway, which is why this spec ships buttons and no drag at all.
- `agent-os/standards/components/ux-principles.md` — icon-only `↑` / `↓` carry a `title`;
  unavailable moves are disabled at the ends rather than absent; the current set must stay
  obvious in one second, which is what decision 5 preserves once it follows the lifter.
- `agent-os/standards/components/drawer-pattern.md` — all of this stays inside the existing
  autosaving session drawer. No second live-workout UI, no new modal, Done still closes after
  flush; a reorder is just another autosaved draft change.
- `agent-os/standards/development/security.md` — no new query or mutation is introduced, so
  nothing new needs registering in `crossUserReads.integration.test.ts`; the existing
  `replaceSession` scoping by `userId` is what the added cross-user assertion pins.
- `agent-os/standards/development/commits.md` — one logical change per commit (lib resolution,
  move helper, editor wiring, tests), effect-naming subject, and a Spec trailer pointing at this
  folder. The commit body says the root cause: current-set had no notion of the active exercise.

## Deviations

None.
