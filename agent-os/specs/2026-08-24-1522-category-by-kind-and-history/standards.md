# Standards for Category picker by kind

Path references — the files stay canonical.

@agent-os/standards/development/clean-code.md
@agent-os/standards/development/testing.md
@agent-os/standards/development/security.md
@agent-os/standards/development/commits.md
@agent-os/standards/development/dates.md
@agent-os/standards/components/ux-principles.md
@agent-os/standards/components/modal-pattern.md
@agent-os/standards/components/data-grid.md

These cover: logic in `src/lib` with a sibling test; every mutation takes `userId` and proves a second user cannot touch the row; one implementation per concern (Track as bill is one write); calendar-day keys, not `Date`; Category edit in the grid; new envelopes through ModalShell.
