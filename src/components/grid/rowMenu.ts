"use client";

import { menuItemsFor, type MenuItem } from "./ContextMenu";
import { rowMenuSections } from "@/lib/commands/menus";
import {
  buildGridCommands,
  type GridCommandCapabilities,
  type GridSelectionCapability,
} from "@/lib/grid/commandDeck";

/**
 * A row's context menu, from the grid's own capabilities.
 *
 * Eight views used to hand-write a `MenuItem[]` here. They disagreed, as duplicated lists do: one
 * said `Open record` where the toolbar said `Open`, one printed `Ctrl+Insert` and `Shift+Tab` where
 * every other surface printed `⌃Insert` and `⇧Tab`, and one offered Indent and Outdent that existed
 * nowhere else in that view. Now a view supplies the two things only it can know — its capabilities,
 * and this particular row's legality — and the labels, glyphs, shortcuts, ordering and
 * disabled-with-a-reason all come from `buildGridCommands`.
 *
 * **Why re-build rather than read the registered list:** right-clicking a row that is not selected
 * selects it first, in the same event, so the registered commands still describe the *previous*
 * selection when the menu opens. The row menu has to be about the row under the pointer, so it is
 * built for that row.
 */
export function rowMenuFor(
  capabilities: GridCommandCapabilities,
  selection: GridSelectionCapability,
): MenuItem[] {
  return menuItemsFor(
    rowMenuSections(buildGridCommands({ ...capabilities, selection })),
  );
}
