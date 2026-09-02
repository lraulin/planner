# Standards for Retire Tags and the Legacy Category Column

Applied as of standards commit `91999a0ab88ec727956924e702f589a4a5833395`.
References, not copies — see AGENTS.md. Recover the exact text with
`git show 91999a0ab88ec727956924e702f589a4a5833395:agent-os/standards/<path>`.

- `agent-os/standards/database/migrations.md` — the whole spec turns on one destructive
  migration. Generate it, never hand-write it without its snapshot; it drops three things and
  rewrites 4,798 rows of user-authored text, so `db:push` is not an option.
- `agent-os/standards/development/testing.md` — deleting a column that `mutations.ts` writes
  means the integration suite is the gate, and it silently skips when Postgres is down. Task 7
  requires confirming it actually ran. Tests that exist only to assert the removed
  `category` field are deleted rather than adapted.
- `agent-os/standards/development/clean-code.md` — this is the standard's own signal in
  reverse: the concept is not merely inconvenient, it is wrong for the job it was doing, so the
  model changes rather than the workarounds accumulating. Also governs the dependency direction
  as `actions.ts` exports and the `managedTags` prop chain come out.
- `agent-os/standards/components/data-grid.md` — removing the Register `tags` column and its
  `filterKind: "tags"` touches the shared grid's filter vocabulary. Task 4 checks whether any
  other field uses that kind before removing it.
- `agent-os/standards/components/navigation.md` — one registry for modules and pages; the Tags
  entry comes out of `src/lib/navigation/pages.ts`, and any command or ⌘K entry pointing at it
  goes with it. A route that 404s must not still be reachable from chrome.
- `agent-os/standards/development/commits.md` — the migration commit's body has to say what
  was deleted from Notes and why, because nobody reviews these before they land and the
  message is the only record of a one-way content change.

## Deviations

**None**, with one thing worth stating explicitly rather than left implicit:

`development/testing.md` asks that every database-touching change get an integration test with
a cross-user case. This spec adds no new integration test, because it adds no new behavior —
it deletes. The cross-user coverage it removes (`tags/mutations.integration.test.ts` and the
`listFinanceTags` case in `crossUserReads.integration.test.ts`) is removed because the
mutations it guarded no longer exist, not because the guard was judged unnecessary. The
migration's correctness is verified against real data by the acceptance criteria in Task 7
rather than by a test, since a one-shot data migration has no second run to assert on.
