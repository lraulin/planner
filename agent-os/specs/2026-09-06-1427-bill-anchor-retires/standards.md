# Standards for "A bill's expected charge follows its charges"

Applied as of standards commit `a1645dc6cde7886e4d6f4f35b4dcda106f1343ef`. References, not
copies — see AGENTS.md. `git show a1645dc:agent-os/standards/<path>` recovers exactly what
applied here.

- `agent-os/standards/development/clean-code.md` — "When the model is wrong, change the model"
  is the rule D3 invokes: a claim payee with zero transactions, created only so a claim can
  exist, is the second workaround for the missing concept. Also the app→components→lib→db
  direction — the amount-nudge rule is a pure function in `commitments.ts`, not logic inside
  `BillsView`.
- `agent-os/standards/development/testing.md` — D3 changes a database query and D2 changes a
  write validation, so both get integration coverage with a second user who fails to read or
  change the first user's rows. D1 is pure date logic and is where a wrong answer looks most
  plausible, so its tests are named for the claim each defends. No React component tests for
  the new panel.
- `agent-os/standards/development/dates.md` — every date here is a `YYYY-MM-DD` key;
  `daysBetweenKeys` / `shiftDateKey` do the arithmetic and `todayKey` is always supplied by the
  caller. No `Date` on a calendar field.
- `agent-os/standards/development/security.md` — the rewritten `lastChargeByEnvelope` and
  `lastChargeOnBill` keep their `userId` scope on every table they touch, including the
  Amazon-receipt union.
- `agent-os/standards/development/commits.md` — one logical change per commit; the diagnosis
  correction (the frozen follow-up named the wrong cause) belongs in the commit body, not only
  in this folder.
- `agent-os/standards/components/ux-principles.md` — the "Amount changed?" panel is a
  disclosure beside the existing review panel, in the same register: it proposes, it does not
  assert, and nothing is written without a click.

## Deviations

**None.** One judgement worth recording because it looks like a deviation and is not: D3
deliberately does **not** reuse `billClaimAccepts`'s amount band, even though DRY-for-business-
rules would suggest it. They answer different questions — "should this charge be filed here?"
versus "has the charge I was waiting for arrived?" — and the data shows the first rule gives
the wrong answer to the second on seven of 33 live bills. The reasoning is in `plan.md` D3 so
the next reader does not undo it.
