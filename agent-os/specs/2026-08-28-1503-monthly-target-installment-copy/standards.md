# Standards for monthly target installment copy

**Status: frozen / complete** (2026-08-28)

Applied as of standards commit `2920aa766f203439f2136c831f01ccd182c0654d`.
References, not copies — `git show <sha>:agent-os/standards/<path>` recovers exactly what
applied.

- `agent-os/standards/development/clean-code.md` — keep one shared implementation of the
  scan-layer rule; remove the wrong deadline concept rather than adding a formatting
  exception at a component call site.
- `agent-os/standards/development/testing.md` — exercise the pure indicator beside its
  implementation with cases that fail if a future edit restores deadline-based installment
  wording; do not add React or database tests.
- `agent-os/standards/development/commits.md` — keep the spec record and behavior fix as
  logical commits, explain the root cause and deliberate non-changes, and cite this delta via
  its canonical `Spec:` trailer.

## Deviations

None.
