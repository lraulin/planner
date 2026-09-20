# Standards for holds are never deleted by absence

**Status: active**

Applied as of standards commit `30a9c769`. References, not copies — recover the text with
`git show 30a9c769:agent-os/standards/<path>`.

- `agent-os/standards/development/clean-code.md` — "when the model is wrong, change the model":
  removal-by-absence is the wrong concept, so it is replaced by a flag (D3) rather than guarded by
  more conditions. One shared carry/keep rule for both pipelines (D5).
- `agent-os/standards/development/testing.md` — reconcile and pairing changes are pure and get unit
  tests that fail on the observed mistake (Sep 20 replay). Snapshot apply, sync apply and restore
  get `*.integration.test.ts` with a second user who fails to read, change and delete. No React
  component tests. Userscript completeness logic is tested against saved page HTML.
- `agent-os/standards/development/security.md` — restore and resolve actions prove ownership by
  `userId` on every query and mutation.
- `agent-os/standards/database/migrations.md` — the `unlisted_at` column and its migration.
- `agent-os/standards/development/dates.md` — the statement close date is a calendar day.
- `agent-os/standards/development/commits.md` — one logical change per commit, root cause in the
  body, `Spec:` trailer.
- `agent-os/standards/components/drawer-pattern.md` — only if the restore control lands in the
  Activity drawer; confirm at implementation.

## Deviations

None.
