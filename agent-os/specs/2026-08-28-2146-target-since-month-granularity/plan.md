# `since` is a month guard, not a day filter

**Status: frozen / complete** — 2026-08-28
Spec folder: `agent-os/specs/2026-08-28-2146-target-since-month-granularity/`

## Spec relationships

- **Supersedes:** `agent-os/specs/2026-08-28-2039-target-refill-basis/` **D2**, in one respect
  only — "occurrence counting skips anchors before `since`", and the acceptance criterion "a
  target with `since` = 2026-08-28 asks one Sunday in August 2026". Everything else in D2 stands:
  the cap does not shrink as anchors pass, `since` is stamped on first save and preserved
  through every edit, derived bill targets carry none, and the backfill reads `created_at`.
- **Extends:** the same spec's **D1** (two families) and **D3** (deadline-free floors), untouched.

## Context

Reported on the live budget the evening it shipped. Groceries, `upTo` $210.96 each Sunday,
August 2026:

| Assigned | Activity | Available |
| -------: | -------: | --------: |
|  $943.59 | −$785.53 |   $158.06 |

The page said **Funded**, and the drawer explained why: "August 2026: 1 Sunday × $210.96 =
$210.96. Counted from 8/24/2026, when this target started." One more shop was coming and only
$158.06 was left to buy it with.

`since` was `2026-08-24` because the backfill reads `created_at`, and **every envelope in the
budget was created the day the budget was set up** — mid-month. So the cap for August fell from
five Sundays to one, while a whole month of assignment ($943.59) and spending (−$785.53) sat
against it. Deleting and recreating the target changed nothing, because a target recreated on
the 28th trims to the same single Sunday.

The frozen spec states the rule both ways. Its implementation note says occurrence counting
"skips anchors before `since`"; its own summary of D2 says:

> a month before the target existed asks nothing; **a month during which it existed asks its
> whole cap, past or not.**

The first was implemented. The second is right, and it is the reading that makes D2's own
Groceries criterion — a $1,054.80 cap asking "$211.21 more" against $843.59 assigned — arithmetically
reachable at all. The two could not both hold.

## Decisions

### D1 — `since` compares months, never days

`wholeOccurrences` returns 0 when `monthKeyOf(since) > month`, and otherwise counts the month
whole. The day inside `since` is recorded but never filters anchors.

The cap answers **what this envelope's month costs**. Not what it costs from today — that was
the `remainingOccurrences` mistake `target-refill-basis` D2 removed — and not what it costs from
the day the target was written down, which is the same mistake wearing a different date. A month
is either one the target asks for or one it does not.

Counting the start month whole cannot over-ask, because **Assigned counts toward the cap**: a
target adopted mid-month asks only for what its month is still short of. The one case that funds
early is a brand-new envelope with nothing assigned and nothing spent, which asks its whole month
on the day it is created; that money is not lost, it lands in carry-in and reduces next month's
refill. Trimming to avoid it cost a wrong **Funded** on an envelope with a real shortfall, which
is the worse error — a budget that overstates a hole gets corrected next month, one that hides a
hole gets found at the till.

`countWeekdayFromDay` and `monthAnchorDay` are deleted with it. Both existed only to answer "from
which day", which is a question the model no longer asks.

### D2 — Deliberate divergence from YNAB, recorded

`target-refill-basis` cited YNAB dropping Needed This Month from $1,054.80 to $210.96 when the
grocery target was deleted and recreated on the 28th, and took that as the rule. **We do not
reproduce it.** Our cap for the start month is the whole month. The observation was real; what it
justified was the month-level guard, not a day-level one, and the live consequence decided it.

A useful side effect: deleting and recreating a target no longer changes this month's ask, so
there is no reason to do it.

## Acceptance criteria

- [x] Groceries — `upTo` Sunday $210.96, `since` 2026-08-24, August 2026, $943.59 assigned —
      asks **$1,054.80**, reads **"$111.21 more needed this month"**, and is not Funded.
- [x] A `since` anywhere inside the month it names counts that month exactly as no `since` does.
- [x] A month entirely before `since` still asks **$0**; a month entirely after asks its whole cap.
- [x] The drawer's computed line only mentions the start day when the month asks nothing.
- [x] `add`, the pile family, derived bill targets, and the floor bucket are unchanged.

## Files

| Path                                                | Change                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/finances/budget/targets/cadence.ts`        | `since` guards on month key; `countWeekdayFromDay` and `monthAnchorDay` deleted |
| `src/components/finances/budget/TargetDrawer.tsx`   | the note explains a zero month instead of a trimmed count                       |
| `targets/cadence.test.ts`, `targets/demand.test.ts` | the live case as a named regression; the superseded day-filter cases rewritten  |

No migration: the stored `since` values are already correct, and are now read at month
granularity.

## Changes from original plan

| #   | Change                                                                               | Why                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `monthAnchorDay` was deleted along with `countWeekdayFromDay`, and its test with it. | With the day comparison gone from the `month` arm, nothing in `src` called it — it was exported code kept alive only by its own test. |
