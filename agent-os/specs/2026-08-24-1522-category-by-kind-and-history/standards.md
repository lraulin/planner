# Standards for Category picker and payee auto-categorisation

Path references — the files stay canonical.

@agent-os/standards/database/migrations.md
@agent-os/standards/development/clean-code.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/security.md
@agent-os/standards/development/commits.md
@agent-os/standards/development/dates.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/navigation.md
@agent-os/standards/components/data-grid.md
@agent-os/standards/components/drawer-pattern.md
@agent-os/standards/components/responsive.md
@agent-os/standards/components/modal-pattern.md

These cover:

- Generate the schema migration; hand-write the data cutover and abort guard; commit SQL + snapshot + journal together.
- Logic in `src/lib` with a sibling test; one implementation per concern (Track as bill is one write; auto-category is one payee mutation; flow classifiers are ordinary code, not a second engine).
- Every mutation takes `userId` and proves a second user cannot read, change, or delete the row.
- Calendar-day keys, not `Date`.
- Rules leaves the page registry, menu bar, and command surfaces together — a destination without a menu is not shipped, and a removed destination must be absent from all of them.
- Payee Auto Category / Envelope are grid columns; the drawer holds mode + default; claimed-payee controls are disabled with a reason, never missing.
- Below `md` the same Payee actions are tappable; desktop keeps keyboard paths.
- Category edit in the grid; new envelopes through ModalShell.
