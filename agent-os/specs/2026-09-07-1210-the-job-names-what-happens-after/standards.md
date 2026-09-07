# Standards for "The job names what happens after you spend it"

Applied as of standards commit `a1645dc`. References, not copies — see `AGENTS.md`.

- `agent-os/standards/components/ux-principles.md` — the change is copy and one line of layout in
  an existing drawer. No new control, no help popover, no disclosure; the fix for an unclear
  choice is a clearer sentence, not more chrome.
- `agent-os/standards/development/testing.md` — **no React component tests**, which is the
  standing rule and applies squarely: this is a component with no logic to unit-test. The gate is
  the type checker, `npm run smoke`, and looking at it in the browser. The existing `lib` suites
  are the guard that no behaviour moved.
- `agent-os/standards/development/commits.md` — one logical change, a body saying what the
  labelling failure was rather than only what the strings became.
