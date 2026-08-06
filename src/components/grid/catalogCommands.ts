"use client";

import type { GridCommandCapabilities, GridPageCommand } from "@/lib/grid/commandDeck";

/**
 * The command set for a **flat catalog** grid: Contacts, Resources, Time Charts.
 *
 * Three views with the same three verbs — make one, open one, delete one — and, before this, three
 * copies of the same capabilities block plus three hand-written row menus. They had already drifted:
 * one printed `New Time Chart` where its own toolbar said `New time chart`, and each spelled out
 * `Insert` / `Enter` / `Delete` again beside the labels.
 *
 * Only the nouns differ, so only the nouns are arguments.
 */
export function catalogCapabilities({
  createLabel,
  openLabel,
  deleteLabel = "Delete",
  selection,
  onCreate,
  onOpen,
  onDelete,
  pageCommands = [],
}: {
  /** e.g. `"New contact"`. */
  createLabel: string;
  /** e.g. `"Open contact"` — Time Charts says `"Edit areas"`, which is what it really does. */
  openLabel: string;
  deleteLabel?: string;
  selection: { id: string | null; count: number; label?: string | null };
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  /** Anything this catalog has beyond the three verbs. */
  pageCommands?: readonly GridPageCommand[];
}): GridCommandCapabilities {
  const noRow = selection.id === null ? "Select a row first" : undefined;

  return {
    selection,
    actions: {},
    pageCommands: [
      {
        id: "grid.create",
        label: createLabel,
        group: "record",
        menu: "new",
        section: "New",
        icon: "new",
        toolbar: 10,
        // Apple keyboards have no Insert key, so ⌘⏎ is bound alongside it. `Insert` is what gets
        // printed, which is what these views already showed.
        bindings: [{ key: "Insert" }, { key: "Enter", meta: true }],
        run: onCreate,
      },
      {
        id: "record.open",
        label: openLabel,
        group: "record",
        menu: "item",
        section: "Item",
        icon: "open",
        toolbar: 50,
        rowMenu: true,
        bindings: [{ key: "Enter" }],
        disabled: selection.id === null,
        title: noRow,
        run: () => selection.id && onOpen(selection.id),
      },
      {
        id: "record.delete",
        label: deleteLabel,
        group: "record",
        menu: "item",
        section: "Danger",
        icon: "delete",
        rowMenu: true,
        destructive: true,
        bindings: [{ key: "Delete" }, { key: "Backspace" }],
        disabled: selection.id === null,
        title: noRow,
        run: () => selection.id && onDelete(selection.id),
      },
      ...pageCommands,
    ],
  };
}
