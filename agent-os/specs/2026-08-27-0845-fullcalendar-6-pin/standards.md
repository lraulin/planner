# Standards for Stay on FullCalendar 6

Applied as of standards commit `91b94c63894ceb565c206327847af2185a9b194d`. References, not
copies — see AGENTS.md. Recover exactly what applied with
`git show 91b94c6:agent-os/standards/<path>`.

- `agent-os/standards/development/security.md` — declining a major upgrade is a
  security-relevant decision. What the standard asks for here is not that dependencies always
  move, but that a deliberate pause is bounded and checkable: hence a named lift-trigger
  (`@fullcalendar/timegrid@7` on `latest`, or any v6 advisory) rather than an open-ended
  "later", and the `npm audit` check recorded in `shape.md` showing no current exposure.
- `agent-os/standards/development/commits.md` — the `.github/dependabot.yml` change is a
  one-line diff whose entire value is the reasoning behind it. Body carries the registry facts
  and the lift-trigger; canonical Spec trailer.
- `agent-os/standards/development/testing.md` — cited for why the migration is deferred rather
  than for anything this spec builds. Its "no React component tests" rule is what leaves the
  four FullCalendar components without a tripwire, which is precisely what makes a v7 CSS and
  DOM rewrite expensive to verify here.

## Deviations

**None.** No code changes, so nothing to deviate from.

One thing worth stating because it looks like a deviation and is not: `2026-07-28-1234-weekly-schedule`
chose "FullCalendar Standard v6 (MIT)". This spec does not supersede that choice — it keeps it,
and adds the reason it is still the right one a month later.
