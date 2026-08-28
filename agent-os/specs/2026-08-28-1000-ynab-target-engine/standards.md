# Standards for YNAB target engine

**Status: frozen / complete** (2026-08-28)

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`. References, not
copies — see AGENTS.md. `git show <sha>:agent-os/standards/<path>` recovers exactly what applied.

- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the model"
  is what licenses replacing the template engine rather than patching one formula; the
  two-workarounds test is met three times over (`shape.md`). Also the app→components→lib→db
  direction that the new `src/lib/finances/budget/targets/` module has to keep.
- `agent-os/standards/development/testing.md` — the target math is pure logic in `src/lib/**`
  and gets tests beside it that fail on a plausible mistake. The migration and
  `saveEnvelopeTarget` are database work and get `*.integration.test.ts` with a second user
  failing to read, change and delete the first user's target. Unit tests run non-isolated, so
  nothing here may mutate module-level state.
- `agent-os/standards/development/dates.md` — occurrence counting reads the UTC-noon encoding
  through `weekdayOfDateKey`; `new Date(key).getDay()` reports Saturday evening for a Sunday in
  the Americas. `todayKey` is threaded as a parameter so the engine never reads a clock.
- `agent-os/standards/database/migrations.md` — the `templates` → `target` migration is
  generated with its snapshot, uses the direct connection, and transforms live data
  irreversibly, which is why Task 6 audits before it writes.
- `agent-os/standards/components/drawer-pattern.md` — the rewritten target drawer keeps the
  DrawerFooter Cancel|Save|Save & Close shape and unsaved-changes handling.
- `agent-os/standards/components/ux-principles.md` — the drawer's field layout and the rule
  that a control's only effect must not be to make the user wonder which setting to pick.
- `agent-os/standards/development/security.md` — every mutation takes `userId` and proves
  ownership before writing.
- `agent-os/standards/development/commits.md` — eleven tasks land as separate logical commits
  with a canonical Spec trailer.

## Deviations

**None from the standards.** The deliberate divergences in this spec are from _reference
implementations_, and belong to `plan.md`:

- **From Actual Budget:** the goal-template engine (`goal_def`, `runSimple`, `runBy`,
  `runPeriodic`, the priority loop, `remainder`) stops governing target semantics entirely.
  Envelope arithmetic, the Apply/Overwrite gesture and schedule sinking are still theirs. Task
  10 records this in `docs/actual-budget/README.md`, which is where cross-cutting Actual
  divergences live.
- **From YNAB:** we take the mechanics and not the vocabulary — no "refill vs set aside"
  dropdown (D7), and no `add` + `year` / `add` + `by` pairings (D2).
