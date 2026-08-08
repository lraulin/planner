# Standards for Task name URL → attachment

The following standards apply to this work.

---

## development/clean-code

**Why:** Logic must live in `src/lib` (pure extract/rewrite + promote mutation), actions stay
thin, every mutation takes `userId`, avoid inventing a second attachment-create path that
diverges from sort-key / user scoping rules without reason. Avoid tree↔detail import cycles
by keeping promote under `src/lib/url/`.

See `agent-os/standards/development/clean-code.md` (layers, naming, small units, one
implementation per concern, `userId` on every mutation).

Key constraints for this feature:

- Pure URL find/rewrite in `src/lib/url/*.ts` with sibling unit tests
- Promote mutation takes `userId` first and scopes every read/write
- `actions.ts` does not reimplement promote — tree mutations call it
- Reuse `normalizeHttpUrl` / `fetchPageTitle` — do not fork title fetching

---

## development/testing

**Why:** Extraction edge cases (punctuation, multi-URL, bare host) are pure and easy to get
wrong; DB path needs create/rename/dedupe and a **cross-user** case.

See `agent-os/standards/development/testing.md`.

Key constraints for this feature:

- Unit tests for extract/rewrite (no network, no DB)
- Integration tests for `promoteUrlsFromTaskName` / create+rename hooks against real Postgres
- Cross-user: second user cannot attach or rewrite the first user's task
- Integration suite must not skip silently — check skip warning after changing mutations
- No React component tests
