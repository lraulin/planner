# Filter control per column kind

**Status: frozen / complete (2026-08-04)**  
Spec folder: `agent-os/specs/2026-08-04-1745-filter-control-per-kind/`

Delta on the frozen [`2026-08-02-1208-custom-column-filters`](../2026-08-02-1208-custom-column-filters/plan.md)
and [`2026-08-04-0924-grid-control-surface`](../2026-08-04-0924-grid-control-surface/plan.md).
Those two shipped one funnel control for every column; this narrows which control each
column kind gets.

## Context

`0802568` made the column funnel a set filter — an Excel/AG-Grid checklist of the distinct
values a column holds, with counts and a `(Select all)` row. `c2b2db2` then exempted
Priority, because ranks are open-ended (`A1`…`A99`) and a list of the ones in use is noise.

Priority was not the only column the checklist was wrong for. It is the **right** control
in exactly one situation: the values are a closed set someone could have picked from a
dropdown, so ticking three of five is a choice among the options themselves. Everywhere
else the checklist is a list of the rows wearing the costume of a filter:

- **Free text and numbers** (Name, Notes, Effort, Cost): the list is as long as the grid.
- **Dates**: worse than useless. The distinct dates a column holds are an accident of the
  data, they carry no relationship to today, and a filter naming them goes stale the
  moment a deadline moves. What a date column is asked is "what is overdue" — a band
  relative to today, or a threshold.

The date bands already existed (`DATE_PRESETS`, from Achieve screenshot 10.57.07) but sat
**under** the checklist as extra checkboxes, so `(Past)` and `(Today)` could be ticked
together — an OR that reads like a narrowing and is not what either label promises.

## Decisions

| Decision               | Choice                                                              | Why                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Set filter eligibility | **`filterKind === "enum"` only**                                    | Closed set ⇒ a dropdown would be the right editor ⇒ a checklist is the right filter. State, Status, Icon, Category, Focus, From.                |
| Every other kind       | **Named bands, one at a time**                                      | Priority ranks, dates, text: what you want is a band or a threshold, not a value from a list.                                                   |
| Bands are exclusive    | **Radio, `(All)` to clear** (`selectPreset`)                        | Two overlapping bands OR'd are either redundant ("Only As" ∪ "Only As & Bs") or a range nobody meant. Achieve's dropdown was single-select too. |
| Text / unknown kinds   | **`BLANK_PRESETS`** — `(Blanks)` / `(NonBlanks)`                    | Keeps the funnel from opening onto nothing; anything narrower on free text is a phrase, which is Custom's job.                                  |
| Anything finer         | **Custom criteria** — already ships `<` `<=` `>` `>=` joined And/Or | Date operands get a date input; `YYYY-MM-DD` compares lexicographically, so no new matching code was needed.                                    |
| Checklist and bands    | **Never both on one column**                                        | `presetOptions(kind).length > 0` ⇔ `!usesSetFilter(kind)`, asserted in `filters.test.ts`. Killed the "Ranges" divider.                          |
| Indicator shape        | **Round for bands, square tick for values**                         | The shape is the only warning that clicking a second band drops the first.                                                                      |
| Stored filters         | **Untouched**                                                       | Still `OptionsColumnFilter.ids` OR'd. A saved multi-band or `value:…` filter keeps matching; only what the funnel can _build_ changed.          |

## Code map

- `src/components/grid/filters.ts` — `usesSetFilter` (now enum-only), `presetOptions`
  (bands per kind), `selectPreset`, new `BLANK_PRESETS`, `DEADLINE_PRESETS` →
  `DATE_PRESETS` (it serves Start / Completed / Note date too).
- `src/components/grid/ColumnHeader.tsx` — the funnel body is one branch or the other;
  bands render as a radio list with `(All)`; `Dot` replaces `Tick` there.
- `src/components/day/dayColumns.tsx` — Item / State / From had no `filterKind` and were
  silently getting the checklist by default. Now `text` / `enum` / `enum`.

## Acceptance criteria

- [x] Enum columns keep the ticked checklist with counts, search and `only`.
- [x] Date columns show `(All)` + the calendar bands, one selectable at a time.
- [x] Priority shows `(All)` + its rank bands, one at a time.
- [x] Text columns show `(All)` / `(Blanks)` / `(NonBlanks)`; no funnel opens onto an
      empty list.
- [x] Custom criteria reachable from every funnel, with comparison operators on date and
      priority.
- [x] Verified in the app on Projects: Deadline, State, Name, Pri (screenshots under
      `.artifacts/planner-shots/`).

## Follow-ups (new work)

- **Numeric columns have no comparison operators.** Effort, Cost and Importance are
  `filterKind: "text"`, so Custom offers `contains` / `starts with` and no `>`. Losing the
  value checklist did not cost them much — exact-matching `"1h 30m"` was already a poor
  filter — but the honest fix is a `number` kind with `COMPARE_OPS`, which needs the
  formatted cell string (`2h 30m`, `$1,200`) parsed back to a number before comparing.
- Relative-date operands in Custom (`> today - 7d`) rather than only absolute dates.
