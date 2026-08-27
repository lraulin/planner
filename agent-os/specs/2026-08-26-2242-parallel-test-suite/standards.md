# Standards for Parallelize the test suite

Applied as of standards commit `c1a0a5aa0ec857f1fbc7dfbce485e10f69555260`.
References, not copies — see AGENTS.md. Recover the exact text with
`git show c1a0a5a:agent-os/standards/<path>`.

- `agent-os/standards/development/testing.md` — the standard that documents the very gate this
  spec changes. Its Mechanics table and its closing "never blocks a commit" paragraph both
  describe behavior that this work alters, so updating it is a task, not a side effect.
- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the model."
  One global `fileParallelism` flag standing in for two suites with different isolation needs is
  the wrong model, and the fix is to split it rather than to special-case around it.
- `agent-os/standards/development/dates.md` — indirectly. The `TZ: "America/New_York"` pin in
  `vitest.config.ts` and its comment must survive the config restructure intact; several tests
  only fail at a negative UTC offset.
- `agent-os/standards/development/commits.md` — this lands as several logical changes (config
  split, connection bound, hook, standard) and should not be squashed into one commit.

## Deviations

None.
