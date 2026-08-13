# Standards for working-copy views

Full files stay in `agent-os/standards/`. What this work must honour:

## `components/data-grid.md`

Rewrite the Saved views bullets to the working-copy state machine. Named views are snapshots. The live grid is a working copy. Save writes the active saved view; Save as deep-copies. Dirty is “Unsaved changes”, not Custom….

## `components/ux-principles.md`

- Unavailable is disabled with the specific reason (Replace when there are no saved views; Save as at the cap).
- A write that does not change what is on screen needs a flash (Replace, and Save as once the new view is selected).

## `development/testing.md`

- Equality, overrides, and clear-overrides live in `src/lib/settings` with `*.test.ts` beside them.
- No React component tests.
- A test must fail on the plausible mistake (e.g. treating a scope reset as “load definition,” which forgets the origin view id).

## `development/commits.md`

Imperative subject naming the effect, body saying the root cause of the hybrid and what was left alone (frozen specs, Achieve Customize Current View).
