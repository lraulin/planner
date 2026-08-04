# Shaping — Type as a Column, and a Toolbar That Earns Its Width

**Status: frozen / complete** (2026-08-04)

## The ask

> "Now that we have the column menu, we can clean up redundant stuff in the toolbar… we
> added the Icon column… that allows us to filter by icon, ie item type, so we can use that
> instead of a separate checkbox for each one taking up a ton of space.
>
> However, when filtering by Icon column, it can break the hierarchy… From experimenting in
> AP, it seems the way it works is that if you show something, you have to show its ancestors
> no matter what.
>
> I like how we have the icons in the name column… However, if I add the Icon column to allow
> filtering by type, now I have duplicate icons, which looks weird and wrong. Got any good
> ideas for solutions?"

## The three problems, and which one was actually the deep one

The duplicate icon reads as the interesting question and is the shallow one — it is a
rendering conflict with a handful of reasonable answers. The deep one is the hierarchy break,
because it was **not specific to the Icon column at all**: `DataGrid` dropped every row that
did not match, on every grid, for column filters, the advanced filter and the search box
alike. The Icon column just made it obvious, because type is the one field where the rows you
filter out are the rows everything else hangs from.

That reframed the work: the fix is a rule about filtering trees, not a fix for one column.

## Options considered — the duplicate icon

| Option                                                    | Verdict                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Icon column shows the type **word** instead of the glyph  | Strong. Icons never move; the column self-explains; a column headed "Icon" that renders a bare glyph is cryptic anyway.                                 |
| Showing the Icon column **moves** the glyph out of Name   | Strong. Faithful to Achieve, stays 3rem, and makes the column a placement choice. Costs the in-name icon exactly while you are filtering by type.       |
| Keep the glyph column, add a compact toolbar Type control | Rejected on its own: it puts back a toolbar control the whole exercise is trying to remove.                                                             |
| **Both columns, plus the move** _(chosen — user's call)_  | The filter is a rare nice-to-have, so it must not cost the in-name icon: `type` is what you add to filter, `icon` is what you add for Achieve's layout. |

The user picked the pairing directly: _"I guess we could have a type column in addition to
the Icon column. It's not even a filter I often use; it's just nice to know it's there in
case I want it."_ The sentence that decided it is the second one — a rare control must not
charge a permanent price.

## Constraints that shaped it

- **`data-grid.md`: "Hierarchy survives every operation."** Already written, already the
  governing rule, and already being violated by the filter pipeline. The fix is enforcement,
  not a new policy — which is why it applies to every grid rather than to the Outline.
- **`data-grid.md`: filtering acts on _defined_ columns, not visible ones.** Why hiding the
  `type` column does not un-ask a type filter, and why the filter can outlive the column
  being on screen.
- **`ux-principles.md`: "Clarity over cleverness"** and **progressive disclosure**. The four
  type checkboxes were neither: permanent width for a question the per-type tabs answer
  better.
- **The testing standard.** The ancestor rule is pure and lives in `lib/grid/ancestors.ts`
  with the tests; the rest is verified by driving the real grid.

## What "done" looked like

Filter the Outline to `Type: Task` and read the row labels back — every task with its
Result Area, Goal and Project above it, nothing orphaned. Search `bench` and get the match in
context. Add the Icon column and count the glyphs; hide it and count again. Then look at the
toolbar and see seven controls where there were thirteen.
