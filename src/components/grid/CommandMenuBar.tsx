"use client";

import { buildMenus } from "@/lib/commands/menus";
import type { Command } from "@/lib/commands/registry";
import { MenuButton } from "@/components/shell/MenuButton";
import { menuItemsFor } from "./ContextMenu";

/**
 * The view's menu bar: `New · Item · Organize · View · Tools`.
 *
 * The whole point of the slice. Before this, a view's commands were a flat row of eleven
 * identically-bordered words with the rest behind an unsorted `⋯` — a traditional app menu with
 * the organization removed. Named menus with headings inside them say what shape the command set
 * has before you open one, which is what Achieve's bar did and what Google Sheets still does.
 *
 * A menu with nothing in it does not render, so a flat catalog grid shows two names and the
 * Outline shows all five. That is `data-grid.md`'s rule — a tab declares what it *has* — applied
 * to commands rather than columns.
 */
export function CommandMenuBar({ commands }: { commands: readonly Command[] }) {
  const menus = buildMenus(commands);
  if (menus.length === 0) return null;

  return (
    // `-mx-1`: the buttons are borderless and carry their own padding, so without this the bar's
    // first word sits two paddings in from the toolbar edge and reads as indented.
    <div
      role="menubar"
      aria-label="Commands"
      className="-mx-1 flex flex-none items-center"
    >
      {menus.map((menu) => (
        <MenuButton
          key={menu.id}
          label={menu.label}
          items={menuItemsFor(menu.sections)}
        />
      ))}
    </div>
  );
}
