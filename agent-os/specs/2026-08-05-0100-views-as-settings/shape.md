# Shaping — Views as Collections of Settings

**Status: frozen / complete** (2026-08-05)

## The ask

> "Ok, let's do it"

— against a standing proposal: make `GridSettings.filters` distinguish "never set" from
"explicitly cleared", then use it for both the Outline's default and for turning the `View`
pickers into visible settings.

## Why the distinction is the whole feature

A default filter and a clearable filter pull in opposite directions, and one field cannot hold
both without a third state:

| Stored  | Means                  | Grid shows                        |
| ------- | ---------------------- | --------------------------------- |
| `null`  | Never touched          | The view's defaults               |
| `{}`    | Cleared, deliberately  | Everything, and it stays that way |
| `{ … }` | The user's own filters | Those                             |

Collapse `null` and `{}` and you get one of two broken products: a view whose default cannot
be turned off (clearing lasts until the next read), or a view that cannot have a default at
all. This is the same shape `order` and `groupBy` already use, for the same reason, which is
why the fix was to follow an existing pattern rather than invent one.

## The migration was the risky part

Every existing blob already stores `filters: {}`, written unconditionally by
`serializeGridSettings`. Read naively, every grid in the app would have said "the user cleared
everything" and no default would ever have appeared for anyone already using it.

`SETTINGS_VERSION` exists for exactly this — "bumped only when a payload shape changes in a
way defaults cannot absorb" — so v1's empty map reads as _never set_, while a v1 map with real
filters is left alone. The cost is bounded and one-time: someone who had genuinely cleared
every filter on a v1 grid gets that view's defaults back once.

## Making a default look like a setting

The point is that a default must be **indistinguishable from one you set yourself** — same
chip, same funnel state, same `Clear all`. That forced two things that were not in the plan:

1. A set filter stores what is _ticked_, so "hide two of nine states" is seven ids, and the
   chip read `State: 7 selected` — it named the column and withheld the only thing you wanted
   to know. Chips now describe by exclusion when that list is shorter.
2. Goals then showed `Status: 7 selected · Showing 22 of 22` — a chip accounting for rows that
   were not missing, because no goal is settled. A filter ticking every value the column holds
   now draws no chip at all, and gets one back the moment a ticked-off value appears.

Both were found by opening the app and reading the bar, not by reading the code.

## What `keep` is for now

`sliceTree`'s `keep` is **structural only**: "this tab shows tasks". Which _states_ a view
shows is a filter the user can see. The dividing line is whether changing it would still leave
you on the same tab — hiding completed tasks does, showing projects instead of tasks does not.

## What "done" looked like

Open the Outline and read the chip. Clear it, reload, and confirm it is still cleared — that
single step is the entire justification for the nullable field. Reset the grid and watch the
default come back. Then cycle the Tasks views and check the arithmetic: 33 completed plus 5
active is 38 total.
