# Shaping — Security hardening + security standard

**Status: frozen / complete** (2026-08-12)  
Authoritative as-built detail: `plan.md` (including **Changes from original plan**).

## The ask (refined)

"Since I'm starting to store my financial data in this app, are our security practices
adequate?" — followed by "let's do it, and document security standards appropriate for this
app."

So this is two deliverables, and the second is the one with the longer half-life: **close
the real perimeter gaps**, and **write down the security reasoning** as an Agent OS standard
so it survives into work nobody has shaped yet.

## Scope

Content Security Policy with a per-request nonce, the static security headers, redaction of
database errors at the action boundary, a raised password minimum, Dependabot, and
`agent-os/standards/development/security.md`.

### Out of scope

- **Two-factor auth.** The password is 36 random characters from a manager; 2FA would add a
  recovery-code failure mode for a threat already closed.
- **Database-backed rate limiting.** See decision 2 in `plan.md`.
- **A `UserFacingError` migration** across 152 throws. See decision 3.
- **CI workflow.** Husky already covers lint/typecheck/tests.
- **Audit logging, soft-delete for finance rows, encryption at rest beyond Neon's default.**
  Real topics, but none of them is what a public URL holding bank data most needs first.
- **Anything touching the finance data model.** This spec adds no columns and no migrations.

## Decisions

Full list in `plan.md`. The two that took the most thought:

1. **Why the CSP splits scripts from styles.** The instinct is "strict everywhere," and
   that instinct is wrong here in a way that is only visible if you look at the app:
   FullCalendar positions every event with an inline `style` attribute, and CSP `style-src`
   without `'unsafe-inline'` blocks style attributes as well as `<style>` tags. A strict
   `style-src` produces a calendar with every event stacked at the origin. Meanwhile
   `script-src` with a nonce and `'strict-dynamic'` costs nothing, because all 29 pages are
   already `force-dynamic` — the usual reason people skip nonces (losing static generation)
   does not apply. Strict where it is free and effective; loose where it would break the app
   and buy little.

2. **Why database errors and not all errors.** The doc comment on `actionErrorMessage`
   promised more than the code delivered, which is the kind of thing that gets trusted
   later. The honest fix is to make the code match the comment — but the comment's literal
   reading ("never leak an internal exception string") would require classifying all 152
   throws in `src/lib/`, and would turn every deliberate message like "An account needs a
   name." into "Something went wrong." That is a worse app for a marginal security gain. The
   messages that actually hurt are the ones nobody wrote: Postgres errors carrying table,
   column, and constraint names, potentially with row values in constraint violations. One
   check on `error.name` catches exactly that class.

## Context

- **Visuals:** None. Nothing here has a UI.
- **References:** `references.md`.
- **Product alignment:** No roadmap item covers security directly. The roadmap's Financial
  planning section notes Plaid is deferred partly on "lock-in and **security cost**"
  (`agent-os/product/roadmap.md`), which is the same concern one step further out — this
  spec is the groundwork that makes that judgement callable later.

## Standards applied

- `development/clean-code.md` — the CSP builder is real logic, so it lives in `src/lib/`
  with a test beside it rather than inline in `proxy.ts`; `proxy.ts` stays a thin caller.
- `development/testing.md` — pure logic gets a unit test that would fail on a plausible
  mistake. For the CSP that is "a nonce leaked into `style-src`" and "`'unsafe-eval'` in a
  production policy"; for the error boundary it is "a Postgres error reached the client."
- `development/commits.md` — one logical change per commit, effect-naming subject, body
  explaining that financial data was the trigger.
- `api/error-handling.md` — the import routes' 500 envelope is governed here.
