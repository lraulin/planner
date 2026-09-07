# Standards for "A floor rebuilds all at once"

Applied as of standards commit `a1645dc`. References, not copies — see `AGENTS.md`.

- `agent-os/standards/development/clean-code.md` — **the** standard for this spec. "No speculative
  generality: building for a caller who does not exist" is the whole of D1, and its own test —
  whether the missing concept is _already_ being worked around — is what distinguishes this from
  the model corrections that were right to make. Nothing is being worked around, because the
  envelope does not exist yet.
- `agent-os/standards/components/ux-principles.md` — D2 is one string in an existing drawer. The
  fix for a misleading recommendation is to stop recommending, not to add explanatory chrome.
- `agent-os/standards/development/testing.md` — no React component tests; the `lib` suites are the
  guard that nothing behavioural moved, and they must pass untouched.
