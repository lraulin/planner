# Commits

Agents commit and push here at their own discretion — `CLAUDE.md` says so, and that is not
going to change. So there is no reviewer standing between a bad commit and `master`. What
that removes is the safety net; what it does not remove is the reader. The reader is a
future agent running `git log -S` or `git blame` on a line it is about to change, six
months from now, with none of today's context and no way to ask.

That is the whole job of a commit here: **leave the next agent enough to change this line
safely.** Everything below follows from it.

The division of labour with `agent-os/specs/` is: a spec says what we meant to build and
why we wanted it. A commit says what this diff does to the code and why _this_ shape. They
answer different questions, and `git blame` only reaches one of them.

## One logical change per commit

This is the rule that pays for all the others, and the one agents break by default. An
agent can produce a forty-file diff in a minute, and a forty-file diff can only ever get a
vague message, because there is no single thing to say about it.

- A commit is one thing that could be reverted on its own. If the subject needs an "and",
  that is usually two commits.
- Mechanical churn — a rename, a move, a formatting pass — goes in its own commit, apart
  from behaviour change. `Move the filter rules and item-kind config down into src/lib` is
  a move; the deduplication it enabled is described in its body because it happened in the
  same motion, but a behaviour change would not have ridden along.
- Large commits are legitimate when the change genuinely is one thing — replacing the
  command row touched 57 files because a half-replaced command row does not run. That is
  the exception that needs the body to carry it, not the default.

Small commits are also cheap insurance against the failure mode in `clean-code.md`:
confident, plausible, and wrong. A wrong commit that touched one domain folder is a
one-line revert.

## Subject line

Imperative mood, capitalised, no trailing period, **72 characters hard maximum** and
aim for 50–60. The log averages 51 and has crossed 72 five times in 305 commits; hold that.

Write the **effect on the product or the code**, not the files touched and not the
activity. Complete the sentence "If applied, this commit will…".

| Instead of              | Write                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `Refactor actions.ts`   | `Give every server action one run() instead of eleven copies`         |
| `Fix date bug`          | `Refuse a date that does not exist instead of rolling it over`        |
| `Update grid selection` | `Select the rows the grid is showing, not the ones handed to it`      |
| `Improve fitness UI`    | `Give Fitness one create button instead of two identical plus glyphs` |

The pattern in the good column is doing real work: naming both the new behaviour and the
old one in the same breath tells a reader scanning `git log --oneline` whether this is the
commit they are hunting for, without opening it. Use it whenever a change replaces
something.

Deliberately **not** Conventional Commits — no `feat:` / `fix(scope):` prefix. Nothing in
this repo consumes them: no changelog generation, no semantic versioning, no release
tooling, and one developer. They would spend ten to fourteen characters of a 72-character
budget on a label that no tool reads and that `git log --oneline` already conveys better in
prose. This is a decision, not an oversight — do not "fix" it, and do not start half a
second era in the log.

## Body

Wrap at 72 characters. Explain **why**, and what the diff cannot say for itself. The diff
already shows how.

A body is **required** when any of these is true:

- The change is not obviously correct from the diff — a subtle condition, an ordering
  dependency, a boundary case.
- Something was deliberately left alone, or deliberately not generalised. Say which and
  why, or the next agent will "finish the job" and break something.
- An alternative was considered and rejected.
- The change touches a layer boundary, a `userId` scope, the date encoding, or any other
  invariant named in the standards.
- It is a bug fix: say what the old behaviour was. A subject like "Refuse a date that does
  not exist instead of rolling it over" is only half the story without "February 30th
  silently became March 2nd on import".

A subject alone is fine for the genuinely self-evident: a typo, a log entry, a doc tweak,
a version bump. About a fifth of the log has no body and that is the right proportion.

Things worth putting in a body that are easy to forget:

- **What you verified.** "Verified end to end in a browser", "added the cross-user
  isolation case", "the integration tests ran against real Postgres" — this matters more
  here than in a reviewed repo, because it is the only signal that the gate in
  `development/testing.md` was actually met and not skipped past a `SKIP` warning.
- **What was left for later**, if the change is knowingly partial.
- **A number, when it makes the point**: "274 lines deleted, 86 added" says more about a
  deduplication than a paragraph.

## Trailers

`Spec: agent-os/specs/{folder}` when the work implements a shaped spec. That is the link
from a line of code back to the intent behind it, and it is the only way `git blame`
reaches the spec folder.

**No AI attribution.** No `Co-Authored-By`, no "Generated with", no tool names — this is
already a hard rule in `CLAUDE.md`, and the reason it makes sense here rather than being
mere preference is that almost every commit in this repo is agent-written. A marker present
on everything distinguishes nothing; it would only add four lines of noise to 305 commits
and counting. The transparency argument for attribution assumes a reader deciding which
changes to scrutinise harder. Here, the answer is all of them.

## Before committing

- Run the gates from `clean-code.md` — `npm test`, `npm run lint`, the typecheck — and read
  the diff. A commit that does not build is worse than no commit; `git bisect` has to step
  over it forever.
- Check `git status` for files that wandered in. Staging everything is how a debug script
  or a stray `.env` ends up in the permanent record.
- Push to `origin/master` when the working tree is green. Long-lived local work is a
  liability nobody is reviewing anyway.
- Never rewrite published history. A confusing message that is already pushed gets a
  clarifying follow-up commit, not a rebase.
