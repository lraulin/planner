# Commitments — say what it does — Shaping Notes

**Status: active**

## Scope

A clarity pass over the Commitments feature shipped by
`agent-os/specs/2026-08-16-1938-commitments/`. The arithmetic there is right and stays; what
changes is what the screen says about it, plus the two controls that turned out to be genuine
defects rather than misunderstandings.

Five surfaces:

1. **The `set_aside` flag is deleted** from both tables — an opt-in that no longer has a reason
   to exist and was the single largest source of confusion.
2. **A "Set aside" column that shows the real accrual**, replacing a checkbox plus a monthly
   average that was never the figure being held.
3. **The review list proposes rather than commits** — name it, or fold it into an existing
   group, before a row is written.
4. **Rename and Active on the spend grid**, which had neither.
5. **Dismissed detections** leave the bills grid and become revealable under Review.

### Out of scope

- **Merging two spend groups that already exist.** Deferred (D5) — rename plus add-to-existing
  covers the case going forward.
- **Shortfall attribution.** Still the follow-up the frozen spec named.
- Any change to the accrual arithmetic itself. `setAsideHeld` and `recurringSpendHeld` lose one
  guard clause each and are otherwise untouched.
- Visual identity. This is information design inside the existing system.

## How the shape was arrived at

It started as a support question — _"fill me in on how this Hold checkbox works"_ — from the
person who designed the feature, alongside a concrete failure: clicking **Track as spend** on
Pizza Hut produced an unrenameable recurring-spend row called `Pizza Hut`, when the intent was
a group called _Pizza_ covering Pizza Hut and Domino's both.

Reading the code against the user's own list of stories produced an uncomfortable result:
**two of the seven stories were already satisfied by code they did not know existed**, and one
of those — an annual bill accruing 1/26th per paycheck — was the YNAB-envelope behaviour they
described as _"something we're still trying to figure out"_. It is `cadenceMonths: 12` and it
has worked since the feature shipped.

That reframed the whole thing. The defects are real but small; the failure is that a correct
system is illegible at the point of decision. The Dashboard states the accrual honestly
(_"$2.77 per paycheck of $71.88 · due Mar 30"_). The Commitments page — where you actually
decide — shows a checkbox and `annualCost / 12`. **Two different numbers under one label, and
the decision surface got the wrong one.**

### Why the Hold toggle goes rather than gets explained

The first plan was to keep `set_aside` and label it better. The user pushed back mid-shaping:
_"I'm not sure there should be an option for bills that will be charged this pay period to not
be deducted from available to spend."_

Checking, they were right, and for a reason worth recording. Three cases could motivate
unticking Hold, and all three were already handled elsewhere:

| Reason to untick        | Already handled by          |
| ----------------------- | --------------------------- |
| Don't know the amount   | No amount ⇒ nothing accrues |
| Not really a commitment | `status: ignored`           |
| Cancelled it            | `status: cancelled`         |

The flag predates `status`. When declaring a bill only meant "keep this off the review list", a
second flag was needed to say "…and budget it too". `status` subsumed that and the flag was
never retired. On the spend table it is worse: it defaults `true`, has no UI, and can therefore
only ever be true — a column with one reachable value.

Removing it removes a column, a checkbox, a Dashboard footnote, and the question that started
the conversation. That is a better outcome than a clearer tooltip on a control that should not
exist.

### Why the meter rather than help text

The `ux-principles` line the user quoted back — _"if users have to guess how to do something,
the design has already failed"_ — argues against a help affordance as the fix. A tooltip
explaining that yearly bills accrue over 26 paychecks is still a thing you must go and read.
`▓▓░░░░ $8.31 of $71.88 · $2.77 per paycheck · full Mar 30` in the row is the same information
with nothing to discover. If the meter works, the explanation is unnecessary; if the meter does
not work, the explanation would not have saved it.

### Why the review list gets an editor rather than a fix-it-afterwards path

Rename on the spend grid (Task 3b) makes the Pizza Hut mistake repairable, and for a moment
that looked sufficient. It is not: the frozen spec's shaping notes _open_ with
`1PASSWORDTORONTOON / Yearly / $38.03` as the motivating complaint. The evidence in this
repository says the bank's string is usually not the name a person wants. A flow whose default
outcome is a name you will have to fix has the default backwards, so the editor comes first and
the rename exists for the case where you change your mind later.

## Decisions

Full statements with rationale live in `plan.md` D1–D5. In brief:

- **D1** `set_aside` deleted from both tables; active + an amount is the whole condition.
- **D2** One "Set aside" column showing the accrual; the meter is the explanation.
- **D3** The review list proposes, with an in-place editor, on both tiers.
- **D4** Dismissed rows leave the bills grid, revealable under Review; storage unchanged.
- **D5** Merging existing spend groups deferred.

## Context

- **Visuals:** ASCII layouts for the Set aside cell states and the review-row expansion, agreed
  during shaping and reproduced in `plan.md` Tasks 3 and 4. No image files.
- **References:** See `references.md`.
- **Product alignment:** No roadmap item opens or closes here. The envelopes item closed with
  `2026-08-16-1938-commitments`; this spec makes that closure honest, since the shipped
  behaviour was not discoverable by the person who asked for it. Worth a note at freeze.

## Standards Applied

- **components/ux-principles** — the governing document for this whole spec, and the one the
  user quoted. Clarity over cleverness; inline editing for grid-visible fields (which is what
  the spend name column violates); expand-in-place rather than a modal for the review row;
  immediate, clear feedback; error prevention over recovery.
- **components/data-grid** — the shared `DataGrid` keeps both grids; column changes go through
  `ColumnDef`, and every preference keeps persisting through `useGridState`.
- **components/responsive** — the review-row expansion must stack rather than cramp below `md`,
  and the new controls keep 44px tap targets. The user validates on a phone.
- **components/navigation** — no new commands; the dismissed disclosure is page furniture, not
  a menu entry, so nothing new needs a menu row.
- **development/clean-code** — the accrual stays in `src/lib/finances/`, components arrange and
  format only, `actions.ts` stays thin, `renameRecurringSpend` takes `userId` first.
- **development/testing** — `suggestCommitmentName` and the changed guards get sibling unit
  tests; `renameRecurringSpend` gets an integration test with a second user failing. No React
  component tests. `npm run smoke` after touching `src/app/**`.
- **development/dates** — the accrual figures are `YYYY-MM-DD` throughout; `todayKey` continues
  to come from the browser via `useToday`.
- **database/migrations** — the column drops are generated with their snapshot.
- **api/agent-tools** — dropping `setAside` from the strict schemas is deliberate: an agent
  passing it should fail rather than be silently ignored.
