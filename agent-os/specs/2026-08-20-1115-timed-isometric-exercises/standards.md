# Standards for timed / isometric exercises

References only — the files stay canonical.

@agent-os/standards/database/migrations.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/development/security.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/drawer-pattern.md
@agent-os/standards/components/responsive.md

These cover:

- Generate the migration with its snapshot; commit `.sql`, snapshot and journal entry
  together; migrations run over the direct connection
- Pure logic in `src/lib/**` with adjacent `*.test.ts` — duration parsing, the label
  token, the column list; integration tests for the new column including a second user;
  no React component tests, and check the DB tests did not skip
- `measure` config lives in lib next to `equipment`, not inline in `SessionEditor`;
  `setColumns` replaces branching rather than adding to it; no speculative L/R or
  distance axes
- Every mutation takes `userId` and proves ownership before writing
- Session editing stays the existing drawer with autosave; the stopwatch is inline, not a
  modal
- The set row must stay usable at phone width — the reason unilateral durations were cut
