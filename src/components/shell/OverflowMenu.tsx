"use client";

import { menuItemsFor, type MenuItem } from "@/components/grid/ContextMenu";
import { overflowMenus } from "@/lib/commands/menus";
import { MoreIcon } from "./navIcons";
import { MenuButton } from "./MenuButton";
import { useCommands } from "./CommandProvider";

/**
 * `⋯` — the phone's menu bar.
 *
 * Below `md` there is no command row and no `⌘K`, so this button is the entire command surface,
 * and it used to render one flat unsorted list of everything a view could do. It now renders the
 * *same tree* the desktop bar shows, with the menu names as headings — organized rather than
 * merely present.
 *
 * On desktop it stays mounted but hidden (`md:hidden` at the call site): the named menus are right
 * there, and a third button repeating them is the clutter this replaced.
 *
 * It drops only `ownControl` commands — the ones whose widget (Filter, Group by, Density) is still
 * visible on the view bar down here, so reprinting them is duplication. Commands promoted to the
 * desktop icon row are kept, because that row does not exist on a phone.
 */
export function OverflowMenu({ label = "More commands" }: { label?: string }) {
  /*
   * Sections, not menus, are the headings here.
   *
   * Two levels of heading in one sheet is more structure than a 390px screen can carry, and the
   * section names are the more useful half anyway: `Insert row`, `Move`, `Expand`, `Priority`,
   * `Zoom`, `Saved views` say what you are looking at, where `New`/`Organize`/`View` only say
   * which menu it would have been behind on a desktop that is not here.
   */
  const items: MenuItem[] = menuItemsFor(
    overflowMenus(useCommands()).flatMap((menu) => menu.sections),
  );

  return (
    <MenuButton items={items} ariaLabel={label} title={label} bordered>
      <MoreIcon />
    </MenuButton>
  );
}
