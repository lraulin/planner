# Shaping — Next Actions as a Switch, and a Sweep of the Four Tabs

**Status: frozen / complete** (2026-08-04)

## The principle being applied

> "I'd rather views be collections of settings, not a collection of settings plus one special
> setting that you can't get any other way."

A view that carries a behaviour available nowhere else is not a preset, it is a mode. You
cannot combine it with anything, you cannot see what it is doing, and the only way to describe
it is by name. Next Actions was the clearest example: picking "Next Action Only" was the sole
route to it, on both the tab that needed it most and the one where it was already a setting.

The Task Chooser turned out to be _most of the way there already_ — `onlyNextAction` is a real
field with a real control in Settings…, and the view only seeds it. What was missing was
visibility, so the toggle moved onto the bar beside `Deferred`, which is the same pattern.

## What "only the first leaf sibling" had to mean

The manual's Plan Party example pins it down:

```
Plan Party                      Plan Party
  Make Reservations               Make Reservations
    Find location            →      Find location
    Call to make reservations
  Order Cake                      Order Cake
    Select from catalog             Select from catalog
    Call to order cake
```

Summaries all survive — they are the map. Each contributes one leaf. And the manual's second
screenshot, taken after "Find location" is done, shows "Call to make reservations" in its
place, which is what makes it a _next_ action list rather than a first-action list.

Two details had to be got right or the rule collapses on the Tasks tab specifically:
leaf-ness has to be judged inside the list handed in, and siblings have to be grouped by real
parent rather than by row depth — Tasks re-bases depth, so every task looks top-level and
depth-grouping would leave exactly one next action for the entire tab.

## The review, and what it did _not_ change

The interesting outcome of a redundancy sweep is which controls survive it. Two did, for
reasons worth recording so the next sweep does not re-open them:

- **`Postponed` on Tasks and Projects** looks exactly like a State filter wearing a checkbox,
  which is the test that retired four other controls. It is not: it filters on _inherited,
  dated_ shelving, so a task under a project deferred to next month is hidden by it and no
  State value can say that.
- **`Advanced Filters` on the Chooser** gates the column funnels, which reads as an
  inconsistency now that every grid has a column menu. But the tabbed menu means it hides the
  Filter tab only — sort, move, hide and the rest stay reachable — so nothing is unreachable
  and Achieve's reason (the Chooser's own scoring controls are the primary narrowing) still
  holds.

## The one that got away, and why it is one thing not three

`Active Task Status` and `Active Task Schedule` have **identical** row filters and differ only
in stored column layout; `Completed` and `All` are State filters spelled as code. Making views
seed visible settings is the rest of the user's principle, and it needs `GridSettings.filters`
to distinguish "never set" from "explicitly cleared" — the same missing distinction that
stopped the Outline hiding completed rows by default last cycle. One mechanism unblocks both,
which is an argument for doing it deliberately rather than twice by halves.
