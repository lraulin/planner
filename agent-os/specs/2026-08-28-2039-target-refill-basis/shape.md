# Target demand is an assignment question — Shaping Notes

**Status: active**

## Scope

Correct the basis and the occurrence count of envelope target demand, one day after
`ynab-target-engine` froze. Three changes, one cause:

1. **Basis** — occurrence-counted (`week`, `month`, non-spreading `schedule`) targets stop
   subtracting Activity. `add` asks the full cap; `upTo` asks the cap less carry-in.
2. **Count** — the month's cap is the whole month's anchors, no longer the ones left after today,
   trimmed by a new `since` date on the target rather than by the calendar.
3. **Floors** — `balance` + no deadline stops saying "needed eventually" and starts asking
   `amount − available` this month.

### Out of scope

- The seven legal shapes (`ynab-target-engine` D2). No new pairing, no new behaviour value.
- The drawer's information architecture, the history suggestion, `Apply` / `Overwrite`, the RTA
  clamp, reductions-first, and the Assign preview.
- `add` semantics of any kind. They were already right.
- Any change to what a bill's derived target _is_ (`ynab-target-engine` D5). Only the arithmetic
  the derived target runs through moves.

## Decisions

See `plan.md` D1–D4 for the statements themselves. What is worth keeping here is _why the
previous spec got it wrong_, because that is the part a later refactor will re-derive:

- `ynab-target-engine` D4 was written from one worked example — "keep $500 available, carry in
  $400, spend $200, ask $300". That example is a **floor**, and for a floor the rule is right.
  The spec then applied it to every `upTo`, including weekly groceries and pizza, where it means
  "you must hold a full week's cash after you have already bought the week's food".
- The tell was already in the tree: `paidFromActivity` (`demand.ts:104`) is the same bug on the
  `schedule` cadence, patched at the call site. A second workaround for one missing distinction.
- YNAB keeps the two apart explicitly — spending targets read Assigned in the period, "have a
  balance of" reads Available. We collapsed them into one basis and then had to special-case our
  way back out.

The reversal this costs is real and was accepted with the number in front of us: Groceries on
2026-08-28 goes from "$152.90 more needed" back to "$211.21 more needed", which is what
`ynab-target-engine`'s own Context section calls the wrong answer. It is the right answer under
YNAB's semantics, which is the arbiter Lee chose, and the $58.06 it leaves over is not lost — it
rolls into September and reduces September's refill.

## Context

- **Visuals:** none supplied as files. The evidence is Lee's reconstruction of the Pizza category
  in YNAB — same target, same four transaction amounts on the same dates, same money assigned —
  reading `Refill Up to $33.05 Each Week / By Friday / You've met your target! / Needed This
Month $132.20 / Funded $134.76`. Quoted in `references.md`.
- **References:** `src/lib/finances/budget/targets/{demand,cadence,types}.ts`,
  `src/lib/finances/budget/{indicator,assign/plan}.ts`,
  `src/components/finances/budget/TargetDrawer.tsx`. See `references.md`.
- **Product alignment:** N/A — a correction inside a delivered roadmap item, not a new one.

## Research note

YNAB's support articles render client-side and could not be fetched as text; the Google AI
summary Lee pasted is wrong in the way that matters (it omits Assigned from the weekly refill
formula and reads the result as an Available floor). The empirical reconstruction is therefore
the primary source, and it is a better one: same inputs, observed output. Do not replace it with
a citation later without re-running the experiment.

The one detail the reconstruction leaves genuinely ambiguous is YNAB's own inspector, which can
print "Needed This Month $1,000" beside "To Go $0.00" on the same weekly target. That is YNAB
leaking a per-week funding view into a per-month total. **Our engine must not reproduce it:** one
cap, one gap, one sentence.

## Standards Applied

See `standards.md`.
