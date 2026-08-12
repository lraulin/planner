# Standards applied — Security hardening

**Status: frozen / complete** (2026-08-12)

## Standards this work follows

- **Clean code** (`development/clean-code.md`): app → components → lib → db. The CSP policy
  string is real logic with real invariants, so it lives in `src/lib/security/csp.ts` with a
  test beside it; `src/proxy.ts` stays a thin caller that generates a nonce and sets
  headers. `src/lib` must not know it is in a web app — the builder takes plain arguments
  (`nonce`, `isDev`) and returns a string, rather than reaching for `process.env` itself.
- **Testing** (`development/testing.md`): a test earns its place if it would fail on a
  plausible mistake. The plausible mistakes here are specific and worth naming:
  - a nonce leaking into `style-src` (silently disables `'unsafe-inline'` → broken calendar),
  - `'unsafe-eval'` surviving into a production policy,
  - `upgrade-insecure-requests` appearing in the dev policy (breaks `http://localhost:3047`),
  - a Postgres error reaching the client.
    No React component tests.
- **Error handling** (`api/error-handling.md`): the import routes' failure envelope stays
  `{ ok: false, error }`; only the _content_ of `error` changes for database failures.
- **Commits** (`development/commits.md`): one logical change per commit, imperative subject
  naming the effect, body explaining that financial data landing in the app was the trigger.
  No Conventional Commits.

## The new standard this work produces

`agent-os/standards/development/security.md`. Outline, with the reasoning each section has
to carry — the rule alone is not the useful part:

1. **Per-user scoping is the core invariant.** Every mutation takes `userId` first and
   proves ownership _before_ writing. The reason is not tidiness: an `UPDATE ... WHERE id=?
AND user_id=?` that matches nothing is indistinguishable from a successful no-op, so a
   dropped `userId` is invisible unless something checks. Every DB test needs a second user
   attempting read, change, and delete. Points at
   `src/lib/db/crossUserReads.integration.test.ts` as the repo-wide sweep to register new
   query modules in. Cross-references `development/testing.md`.

2. **The auth gate is server-side; the proxy is not the gate.** `src/proxy.ts` checks cookie
   _presence_ to keep guests out of the chrome. The authority is `getCurrentUserId()` inside
   each page and action. Worth stating explicitly because the redundancy looks removable —
   and because Next's middleware-bypass CVE class (CVE-2025-29927) was a non-event here
   precisely because of it.

3. **Three identities stay separate**, and unconfigured defaults never resolve to real data:
   session user, dev user (`test@example.com`), agent user (required in production, no
   fallback). The history is the argument — these were one function until the local bypass
   started running as the account linked to a real Google Calendar.

4. **Secrets:** environment only; `.env*` gitignored except the template; fail closed when
   unset; timing-safe comparison for any shared secret, hashed first so length does not leak.

5. **Errors:** messages we wrote are user-facing; messages the database wrote are not.

6. **Headers and CSP:** what is set and where, plus the two constraints that will bite the
   next editor — no nonce in `style-src`, `'unsafe-eval'` dev-only — and why HSTS is
   deliberately _not_ ours to set.

7. **Rate limiting:** why in-memory is adequate today and the specific triggers to revisit.
   Documenting the "we chose not to" is the point; otherwise it reads as an oversight.

8. **Dependencies:** patch `next` promptly; dev-only transitives are low priority. Dependabot
   opens the PRs.

9. **Markdown:** `rehype-raw` stays out of `react-markdown`.

Then register it in `agent-os/standards/index.yml` in the same description style as the
existing entries.
