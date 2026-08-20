# Standards for exercise groups

References only — the files stay canonical.

@agent-os/standards/database/migrations.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/development/security.md
@agent-os/standards/development/commits.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/drawer-pattern.md
@agent-os/standards/components/responsive.md

These cover:

- Generate the migration with its snapshot; commit `.sql`, snapshot and journal entry
  together. A new table and a nullable FK column, no backfill.
- Pure logic in `src/lib/**` with adjacent `*.test.ts` — the consecutive-`groupId` fold,
  derived round count, item lettering, and the round operations that must survive members
  with unequal set counts. Integration tests for the new table including a second user who
  fails to read, change and delete the first user's group rows. No React component tests,
  and check the DB tests did not silently skip.
- Grouping and round math live in `src/lib/fitness/**`, not inline in `SessionEditor`;
  `setColumns` is reused unchanged rather than branched on; no speculative per-member rest
  or stored round targets.
- Every mutation takes `userId` and proves ownership before writing — `replaceSession`
  deletes and reinserts group rows, which is exactly where a dropped `userId` would be
  invisible with one test user.
- Grouped logging stays inside the existing autosaving session drawer; the group header is
  inline editing, not a modal.
- The round-major layout must stay usable one-handed at phone width — 44px targets, the
  16px input rule, and no reliance on drag.
- One logical change per commit, effect-naming subject, body explaining why, canonical
  `Spec:` trailer pointing at this folder.
