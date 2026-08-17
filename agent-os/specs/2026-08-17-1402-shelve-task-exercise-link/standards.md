# Standards for shelving the task ↔ exercise link

References only — the files stay canonical.

@agent-os/standards/database/migrations.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/commits.md
@agent-os/standards/development/clean-code.md

These cover:

- Generate migrations; never hand-write a drop without its snapshot; SQL + snapshot +
  journal are one change
- Pure logic and DB mutations get tests; React components do not; a test whose feature
  is gone is decoration
- One logical change per commit; Spec trailer; effect-named subject
- Do not leave a dead column “in case we want it later”
