# Standards for Contacts tab links to real contacts

References only — the files stay canonical.

@agent-os/standards/development/testing.md
@agent-os/standards/development/security.md
@agent-os/standards/database/migrations.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/drawer-pattern.md

These cover:

- Pure logic and DB mutations get tests; React components do not; a mutation suite is not
  done until a second user fails to read, change, and delete the first user's row
- Every mutation takes `userId` and proves ownership before writing a foreign key
- Generate migrations; SQL + snapshot + journal are one change
- One shared implementation per concern (`assertContactOwned`, `ContactSelect`); lib never
  imports app
- Sub-grid rows expand in place; no nested drawer or stacked modal
- Item writes go through the existing `run()` / `{ ok, error }` action wrappers
