# Standards for Hidden categories stay in the Category picker

Applied as of standards commit `f07525efa9cf700e35d44a5b37fa00c76e03bc61`. References, not
copies — see AGENTS.md.

- `agent-os/standards/development/testing.md` — tree + `hidden` marking lives in
  `src/lib/**` with adjacent unit tests that would fail if the omit-filter returned; no
  React component tests.
- `agent-os/standards/development/clean-code.md` — one picker tree (`categoryPickerSections`);
  reuse `budgetChildren`; do not invent a second hierarchy or a second hide filter.
- `agent-os/standards/components/ux-principles.md` — Category stays inline; Hide does not
  become a second filing modal; `(hidden)` is a marker, not a new chrome surface.
- `agent-os/standards/development/commits.md` — one logical change; Spec trailer.

## Deviations

None.
