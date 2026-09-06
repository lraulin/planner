# Standards for "A pile spent on its own purpose does not ask again"

Applied as of standards commit `a1645dc6cde7886e4d6f4f35b4dcda106f1343ef`. References, not
copies — see AGENTS.md. `git show a1645dc:agent-os/standards/<path>` recovers exactly what
applied at shape time.

- `agent-os/standards/development/testing.md` — every line of this change is pure logic under
  `src/lib/finances/budget/`, so it is exactly the "real logic in lib, test beside it" case,
  and the tests must be the kind that fail on a plausible mistake: the charge-month numbers,
  not a restatement of the formula. **No database is touched**, so there is no
  `*.integration.test.ts` here and no cross-user case to add; `saveEnvelopeTarget`'s existing
  integration coverage is unaffected. Nothing under `src/app/**` changes, so `npm run smoke`
  is not the gate for this one — say that in the commit rather than leaving it inferred.
- `agent-os/standards/development/clean-code.md` — the "when the model is wrong, change the
  model" rule is the reason this is a basis change rather than a `monthsLeft === 0` special
  case, and the "one shared implementation per concern" rule is why the ask stays a single
  function that Assign, the indicator, the drawer and Apply all read (`budget-funding-
indicators` D3). The dead parallel engine in `budget/templates/` is named as a follow-up
  for the same reason.
- `agent-os/standards/development/commits.md` — one logical change per commit, an imperative
  subject naming the effect, and a body saying what the root cause was: the pile basis could
  not tell a raid from the pile doing its job.

## Deviations

None.
